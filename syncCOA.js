require("dotenv").config();
const axios = require("axios");
const cron = require("node-cron");

const QB_API_URL = `https://quickbooks.api.intuit.com/v3/company/${process.env.QB_COMPANY_ID}`;
const WRIKE_API_URL = "https://www.wrike.com/api/v4/custom_fields";

// Function to fetch COA from QuickBooks
async function fetchCOA() {
  try {
    const response = await axios.get(`${QB_API_URL}/query?query=SELECT * FROM Account`, {
      headers: {
        Authorization: `Bearer ${process.env.QB_ACCESS_TOKEN}`,
        Accept: "application/json",
      },
    });

    const accounts = response.data.QueryResponse.Account.filter(acc => acc.AccountType === "Expense");
    return accounts.map(acc => ({ id: acc.Id, value: acc.Name }));
  } catch (error) {
    console.error("Error fetching COA:", error.response?.data || error.message);
    return [];
  }
}

// Function to update Wrike dropdown field
async function updateWrikeDropdown(accounts) {
  try {
    await axios.post(
      WRIKE_API_URL,
      {
        title: "Disbursement Category",
        type: "Dropdown",
        settings: { options: accounts },
      },
      {
        headers: { Authorization: `Bearer ${process.env.WRIKE_ACCESS_TOKEN}` },
      }
    );

    console.log("Wrike dropdown updated successfully");
  } catch (error) {
    console.error("Error updating Wrike:", error.response?.data || error.message);
  }
}

// Cron job to run daily
cron.schedule("0 0 * * *", async () => {
  console.log("Running COA sync...");
  const coa = await fetchCOA();
  if (coa.length) await updateWrikeDropdown(coa);
});

console.log("Cron job scheduled to run daily at midnight.");
