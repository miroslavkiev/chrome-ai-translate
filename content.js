let lastSelectedText = "";

document.addEventListener("mouseup", () => {
  lastSelectedText = window.getSelection().toString().trim();
  if (lastSelectedText) {
    chrome.runtime.sendMessage({ action: "textSelected", text: lastSelectedText });
  }
});

// Add event listeners for keydown and keyup to detect Control key presses
document.addEventListener("keydown", (event) => {
  if (event.key === "Control") {
    chrome.runtime.sendMessage({ action: "updateCtrlState", isCtrlPressed: true });
    if (lastSelectedText) {
      chrome.runtime.sendMessage({ action: "translateText", text: lastSelectedText });
    }
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key === "Control") {
    chrome.runtime.sendMessage({ action: "updateCtrlState", isCtrlPressed: false });
  }
});