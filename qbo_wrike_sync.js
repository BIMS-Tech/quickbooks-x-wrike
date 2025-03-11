require("dotenv").config();
const axios = require("axios");
const cron = require("node-cron");

const QB_API_URL = `https://sandbox-quickbooks.api.intuit.com/v3/company/${process.env.QB_COMPANY_ID}`;
const WRIKE_API_URL = 'https://www.wrike.com/api/v4/customfields/'; // Base URL for Wrike API
const customFieldId = 'IEADHUUVJUAH4J2T'; 
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
          Authorization: `Basic ${Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token } = response.data;

    // ✅ Update environment variables dynamically (you should also update .env file manually)
    process.env.QB_ACCESS_TOKEN = access_token;
    process.env.QB_REFRESH_TOKEN = refresh_token;

    console.log("✅ QuickBooks Token Refreshed!");
  } catch (error) {
    console.error("❌ Error refreshing QuickBooks Token:", error.response?.data || error.message);
  }
}

// Function to fetch COA from QuickBooks
async function fetchCOA() {
  try {
    await refreshToken(); // Ensure token is fresh

    const query = "SELECT * FROM Account"; // Double-check syntax
    const url = `${QB_API_URL}/query?query=${encodeURIComponent(query)}`;
    
    console.log(`🔄 Fetching COA from: ${url}`); // Debugging log

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.QB_ACCESS_TOKEN}`,
        Accept: "application/json",
      },
    });

    console.log("✅ COA Fetched:", JSON.stringify(response.data, null, 2));

    if (!response.data.QueryResponse || !response.data.QueryResponse.Account) {
      console.error("❌ No accounts found in QuickBooks response.");
      return [];
    }

    // Filtering only expense accounts
    const accounts = response.data.QueryResponse.Account.filter(acc => acc.AccountType === "Expense");
    return accounts.map(acc => ({ id: acc.Id, value: acc.Name }));

  } catch (error) {
    console.error("❌ Error fetching COA:", JSON.stringify(error.response?.data || error.message, null, 2));
    return [];
  }
}

// Fetch existing custom field options from Wrike to get valid IDs
async function fetchWrikeCustomFieldOptions() {
  try {
    const response = await axios.get(
      `${WRIKE_API_URL}${customFieldId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WRIKE_ACCESS_TOKEN}` // Ensure you have your access token
        }
      }
    );
    console.log("✅ Wrike Custom Field Options:", response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching custom field options:', error.response?.data || error.message);
  }
}


async function updateWrikeDropdown(accounts) {
  try {
    // Fetch the current options from Wrike first to get valid IDs
    const wrikeOptions = await fetchWrikeCustomFieldOptions();
    
    // Map QuickBooks account names to valid Wrike option IDs
    // You should manually verify the Wrike option IDs from the fetched options and map them accordingly
    const validWrikeIds = {
      "Marketing Expenses": "valid_wrike_id_for_marketing_expenses",  // Replace with actual Wrike ID
      // Map other account names to valid Wrike IDs here
    };

    const formattedOptions = accounts.map(acc => {
      console.log(`Debug - Account ID: ${acc.id}, Account Name: ${acc.value}`); // Debugging log
      
      // Use the mapping to find the corresponding Wrike option ID
      const wrikeId = validWrikeIds[acc.value]; // Map QuickBooks account name to Wrike valid ID

      if (!wrikeId) {
        console.error(`❌ No valid Wrike ID found for account: ${acc.value}`);
        return null; // Skip invalid mappings
      }

      return {
        title: acc.value, // Wrike expects 'title' for dropdown options
        id: wrikeId,        // Use the valid Wrike ID
      };
    }).filter(option => option !== null); // Filter out invalid options

    if (formattedOptions.length === 0) {
      console.error("❌ No valid options to update in Wrike.");
      return;
    }

    // Now update Wrike with valid formatted options
    const response = await axios.put(
      `${WRIKE_API_URL}${customFieldId}`,
      {
        title: "Updated Disbursement Category",
        type: "Dropdown",
        settings: {
          options: formattedOptions,  // Use formatted options with valid Wrike IDs
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WRIKE_ACCESS_TOKEN}` // Ensure you have your access token
        }
      }
    );
    console.log('✅ Custom field updated:', response.data);
  } catch (error) {
    console.error('❌ Error updating custom field:', error.response?.data || error.message);
  }
}


// Cron job to run daily at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("⏳ Running COA sync...");
  const coa = await fetchCOA();
  if (coa.length) await updateWrikeDropdown(coa);
});

console.log("✅ Cron job scheduled to run daily at midnight.");

// Export functions for testing
module.exports = { fetchCOA, updateWrikeDropdown };
