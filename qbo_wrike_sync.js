const axios = require("axios");
require("dotenv").config();

const QB_API_URL = `https://sandbox-quickbooks.api.intuit.com/v3/company/${process.env.QB_COMPANY_ID}`;
const WRIKE_API_URL = "https://www.wrike.com/api/v4/customfields/";
const customFieldId = "IEADHUUVJUAH4J4F";
const QB_TOKEN_URL = "https://sandbox-quickbooks.api.intuit.com/oauth2/v1/tokens/bearer";

// Function to refresh QuickBooks access token
async function refreshToken() {
    try {
        const response = await axios.post(
            QB_TOKEN_URL,
            new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: process.env.QB_REFRESH_TOKEN,
            }),
            {
                headers: {
                    Authorization: `Basic ${Buffer.from(
                        `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
                    ).toString("base64")}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        const { access_token, refresh_token } = response.data;
        process.env.QB_ACCESS_TOKEN = access_token; // Will only persist for this session
        process.env.QB_REFRESH_TOKEN = refresh_token;

        console.log("✅ QuickBooks Token Refreshed!");
    } catch (error) {
        console.error("❌ Error refreshing QuickBooks Token:", error.response?.data || error.message);
    }
}

// Function to fetch expense accounts from QuickBooks
async function fetchCOA() {
    try {
        await refreshToken();
        const query = "SELECT * FROM Account";
        const url = `${QB_API_URL}/query?query=${encodeURIComponent(query)}`;

        console.log(`🔄 Fetching COA from: ${url}`);

        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${process.env.QB_ACCESS_TOKEN}`,
                Accept: "application/json",
            },
        });

        if (!response.data.QueryResponse?.Account) {
            console.error("❌ No accounts found in QuickBooks response.");
            return [];
        }

        const accounts = response.data.QueryResponse.Account.filter(
            (acc) => acc.AccountType === "Expense"
        );

        return [...new Set(accounts.map((acc) => acc.Name))]; // ✅ Unique account names
    } catch (error) {
        console.error("❌ Error fetching COA:", error.response?.data || error.message);
        return [];
    }
}

// Fetch existing custom field options from Wrike
async function fetchWrikeCustomFieldOptions() {
    try {
        const response = await axios.get(`${WRIKE_API_URL}${customFieldId}`, {
            headers: { Authorization: `Bearer ${process.env.WRIKE_ACCESS_TOKEN}` },
        });

        if (!response.data?.data?.[0]?.settings?.options) {
            console.error("❌ Invalid response structure from Wrike:", JSON.stringify(response.data, null, 2));
            return {};
        }

        console.log("✅ Wrike Custom Field Options Fetched!");
        return response.data.data[0].settings.options.reduce((acc, option) => {
            acc[option.title] = option.id; // Map title to its ID
            return acc;
        }, {});
    } catch (error) {
        console.error("❌ Error fetching Wrike custom field options:", error.response?.data || error.message);
        return {};
    }
}

// Function to update Wrike dropdown with QBO expense accounts
async function updateWrikeDropdown(expenseAccountTitles) {
    try {
        const formattedOptions = expenseAccountTitles.map((title) => ({ value: title }));

        console.log("🚀 Sending Payload:", JSON.stringify({ settings: { options: formattedOptions } }, null, 2));

        const response = await axios.put(
            `${WRIKE_API_URL}${customFieldId}`,
            {
                settings: {
                    options: formattedOptions,  // ✅ Matches Postman format
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WRIKE_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ Custom field updated successfully!", response.data);
    } catch (error) {
        console.error("❌ Error updating Wrike custom field:", error.response?.data || error.message);
    }
}


// ✅ **Manually test both functions**
async function testIntegration() {
    console.log("🔍 Fetching Expense Accounts from QuickBooks...");
    const expenseTitles = await fetchCOA();

    if (!expenseTitles || expenseTitles.length === 0) {
        console.log("⚠ No expense accounts found.");
        return;
    }

    console.log("📌 Expense Accounts:", expenseTitles);
    console.log("🚀 Pushing to Wrike...");
    await updateWrikeDropdown(expenseTitles);
}

// Run manual test
testIntegration();
