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

  // Load the existing AI model
  chrome.storage.sync.get("aiModel", (data) => {
    if (data.aiModel) {
      document.getElementById("aiModel").value = data.aiModel;
    } else {
      document.getElementById("aiModel").value = "gemma-3-27b-it";
    }
  });

  // Save the API key, target language, and AI model
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const apiKey = document.getElementById("apiKey").value;
    const targetLanguage = document.getElementById("targetLanguage").value;
    const aiModel = document.getElementById("aiModel").value;
    chrome.storage.sync.set({ geminiApiKey: apiKey, targetLanguage: targetLanguage, aiModel: aiModel }, () => {
      status.textContent = "Settings saved successfully!";
      setTimeout(() => (status.textContent = ""), 3000);
    });
  });
});