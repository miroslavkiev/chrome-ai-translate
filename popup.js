document.addEventListener("DOMContentLoaded", () => {
  const closeButton = document.getElementById("close-button");
  closeButton.addEventListener("click", () => {
    window.close();
  });

  chrome.storage.local.get("translatedText", ({ translatedText }) => {
    const translationDiv = document.getElementById("translation");
    if (translatedText) {
      console.log("Displaying translated text:", translatedText);
      translationDiv.textContent = translatedText; // Only display the translated text
    } else {
      console.log("No translation available.");
      translationDiv.textContent = "No translation available.";
    }
  });
});