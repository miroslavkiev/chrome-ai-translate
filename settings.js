document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("apiKeyForm");
  const status = document.getElementById("status");

  // Load the existing API key
  chrome.storage.sync.get("geminiApiKey", (data) => {
    if (data.geminiApiKey) {
      document.getElementById("apiKey").value = data.geminiApiKey;
    }
  });

  // Load the existing target language
  chrome.storage.sync.get("targetLanguage", (data) => {
    if (data.targetLanguage) {
      document.getElementById("targetLanguage").value = data.targetLanguage;
    }
  });

  // Save the API key and target language
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const apiKey = document.getElementById("apiKey").value;
    const targetLanguage = document.getElementById("targetLanguage").value;
    chrome.storage.sync.set({ geminiApiKey: apiKey, targetLanguage: targetLanguage }, () => {
      status.textContent = "Settings saved successfully!";
      setTimeout(() => (status.textContent = ""), 3000);
    });
  });
});