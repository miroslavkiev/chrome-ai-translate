import { GoogleGenAI } from "@google/genai";

// Ensure the GoogleGenAI instance is initialized with the correct API key
async function initializeGoogleGenAI() {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    console.error("API Key is missing. Please set it in the extension settings.");
    return null;
  }
  console.log("Initializing GoogleGenAI with API Key:", apiKey);
  return new GoogleGenAI({ apiKey });
}

// Replace the existing instance with a dynamically initialized one
let ai;
(async () => {
  ai = await initializeGoogleGenAI();
})();

// Ensure the GoogleGenAI instance is initialized before making API calls
async function getAIInstance() {
  if (!ai) {
    console.warn("GoogleGenAI instance is not initialized. Attempting to reinitialize.");
    ai = await initializeGoogleGenAI();
  }
  if (!ai) {
    console.error("Failed to initialize GoogleGenAI. Please check the API key.");
  }
  return ai;
}

let isCtrlPressed = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "isCtrlPressed") {
    isCtrlPressed = message.isCtrlPressed === true; // Explicitly check for true to prioritize Control key detection
    console.log("isCtrlPressed updated:", isCtrlPressed, "isMetaPressed:", message.isMetaPressed);
    sendResponse({ isCtrlPressed });
  }
});

// Listen for messages from content.js to update the isCtrlPressed state
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateCtrlState") {
    isCtrlPressed = message.isCtrlPressed;
    console.log("isCtrlPressed updated from content.js:", isCtrlPressed);
  }
});

// Handle translation requests from content.js
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "translateText" && message.text) {
    console.log("Translation request received for text:", message.text);
    const translatedText = await requestTranslation(message.text);
    if (translatedText) {
      console.log("Translation successful. Translated text:", translatedText);
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        func: showPopupWithTranslation,
        args: [message.text, translatedText]
      });
    } else {
      console.error("Translation failed. No translated text returned.");
    }
  }
});

// Add a function to retrieve the current state of isCtrlPressed
function getCtrlPressedState() {
  return isCtrlPressed;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateText",
    title: "Translate Selected Text",
    contexts: ["selection"]
  });

  console.log("Gemini API Key loaded: ", getGeminiApiKey());
});

// Add logging to ensure the translateText function is being called
console.log("Background script loaded. Waiting for context menu interactions.");

// Add logging to debug context menu click and API call logic
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("Context menu clicked. Info:", info, "Tab:", tab);
  if (info.menuItemId === "translateText" && info.selectionText) {
    console.log("Menu item ID matches and selection text is present.");

    // Temporarily bypass isCtrlPressed check for debugging
    console.log("Bypassing isCtrlPressed check for debugging.");
    const translatedText = await requestTranslation(info.selectionText);
    if (translatedText) {
      console.log("Translation successful. Translated text:", translatedText);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showPopupWithTranslation,
        args: [info.selectionText, translatedText]
      });
    } else {
      console.error("Translation failed. No translated text returned.");
    }
  } else {
    console.log("Menu item ID does not match or no selection text.");
  }
});

// Refactor: Common reusable function for requesting translation
async function requestTranslation(text) {
  console.log("Requesting translation for text:", text);
  try {
    const aiInstance = await getAIInstance();
    if (!aiInstance) {
      console.error("GoogleGenAI instance is not available. Translation aborted.");
      return null;
    }

    const targetLanguage = await getTargetLanguage();
    const response = await aiInstance.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `Translate the following text to ${targetLanguage} and respond with translation only, you may keep formatting like bullets or numbered list, no original text is needed or supplementary commentary: ${text}`
    });

    console.log("API response:", response);
    if (!response || !response.text) {
      console.error("Unexpected API response structure:", response);
      return null;
    }
    return response.text;
  } catch (error) {
    console.error("Error while calling Google Gemini API:", error);
    return null;
  }
}

function showPopupWithTranslation(originalText, translatedText) {
  console.log("Showing popup with translation. Original text:", originalText, "Translated text:", translatedText);
  const selection = window.getSelection();
  if (!selection.rangeCount) {
    console.error("No selection range found.");
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const popup = document.createElement("div");
  popup.style.position = "absolute";
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.top = `${rect.bottom + window.scrollY}px`;
  popup.style.backgroundColor = "#f9f9f9";
  popup.style.border = "1px solid #ddd";
  popup.style.borderRadius = "8px";
  popup.style.padding = "15px";
  popup.style.fontFamily = "Arial, sans-serif";
  popup.style.color = "#333";
  popup.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
  popup.style.transition = "opacity 0.3s ease";

  const title = document.createElement("h3");
  title.textContent = "Translation";
  title.style.margin = "0 0 10px 0";
  title.style.fontSize = "16px";
  title.style.color = "#007bff";
  popup.appendChild(title);

  // Replace asterisks with bullet points for better formatting
  const formattedText = translatedText.replace(/\*/g, "•");
  const content = document.createElement("p");
  content.textContent = `Translated: ${formattedText}`;
  content.style.margin = "0";
  content.style.lineHeight = "1.5";
  content.style.whiteSpace = "pre-wrap";
  popup.appendChild(content);

  const closeButton = document.createElement("button");
  closeButton.textContent = "Close";
  closeButton.style.marginTop = "10px";
  closeButton.style.padding = "8px 12px";
  closeButton.style.backgroundColor = "#007bff";
  closeButton.style.color = "#fff";
  closeButton.style.border = "none";
  closeButton.style.borderRadius = "4px";
  closeButton.style.cursor = "pointer";
  closeButton.style.fontSize = "14px";
  closeButton.style.transition = "background-color 0.3s ease";

  closeButton.addEventListener("mouseover", () => {
    closeButton.style.backgroundColor = "#0056b3";
  });

  closeButton.addEventListener("mouseout", () => {
    closeButton.style.backgroundColor = "#007bff";
  });

  closeButton.addEventListener("click", () => {
    console.log("Popup close button clicked.");
    popup.remove();
  });

  popup.appendChild(closeButton);

  document.body.appendChild(popup);

  // Add an event listener to close the popup when clicking outside of it
  document.addEventListener("click", function handleOutsideClick(event) {
    if (!popup.contains(event.target)) {
      console.log("Clicked outside the popup. Closing it.");
      popup.remove();
      document.removeEventListener("click", handleOutsideClick);
    }
  });
}

// Retrieve the Gemini API key from storage
async function getGeminiApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("geminiApiKey", (data) => {
      if (data.geminiApiKey) {
        resolve(data.geminiApiKey);
      } else {
        console.error("Gemini API Key not found. Please set it in the extension settings.");
        resolve(null);
      }
    });
  });
}

// Retrieve the target language from storage
async function getTargetLanguage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("targetLanguage", (data) => {
      resolve(data.targetLanguage || "uk"); // Default to Ukrainian
    });
  });
}