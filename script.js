// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  const blockchainContainer = document.getElementById("blockchain");
  const addBlockBtn = document.getElementById("add-block-btn");
  const exportChainBtn = document.getElementById("export-chain-btn");
  const importChainBtn = document.getElementById("import-chain-btn");
  const chainStatusEl = document.getElementById("chain-status");
  const totalBlocksEl = document.getElementById("total-blocks");
  const avgMiningTimeEl = document.getElementById("avg-mining-time");
  const networkVisualizationEl = document.getElementById(
    "network-visualization"
  );
  const networkCanvas = document.getElementById("network-canvas");
  const difficultySelect = document.getElementById("difficulty-select");
  const themeToggle = document.getElementById("theme-toggle");

  let difficulty = difficultySelect.value; // Initialize with selected difficulty
  let blockchain = [];
  let miningTimes = []; // Track mining times for statistics

  // Update difficulty when selection changes
  difficultySelect.addEventListener("change", (e) => {
    difficulty = e.target.value;
    // Invalidate all blocks when difficulty changes
    blockchain.forEach((block) => {
      block.mined = false;
      block.updateUI();
    });
    validateChain();
  });

  // --- Tab Functionality ---

  function initializeTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const codeContents = document.querySelectorAll(".code-content");

    // Set first tab as active by default
    if (tabButtons.length > 0 && codeContents.length > 0) {
      tabButtons[0].classList.add("active");
      const firstLang = tabButtons[0].getAttribute("data-lang");
      const firstContent = document.getElementById(firstLang);
      if (firstContent) {
        firstContent.classList.add("active");
      }
    }

    tabButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const lang = button.getAttribute("data-lang");

        // Remove active class from all tabs and content
        tabButtons.forEach((btn) => btn.classList.remove("active"));
        codeContents.forEach((content) => content.classList.remove("active"));

        // Add active class to selected tab and content
        button.classList.add("active");
        const contentElement = document.getElementById(lang);
        if (contentElement) {
          contentElement.classList.add("active");
          // Re-highlight the code in the newly activated tab
          const codeElement = contentElement.querySelector("code");
          if (codeElement && window.Prism) {
            Prism.highlightElement(codeElement);
          }
        }
      });
    });
  }

  // --- Core Blockchain Logic ---

  class Block {
    constructor(index, timestamp, data, previousHash = "") {
      this.index = index;
      this.timestamp = timestamp;
      this.data = data;
      this.previousHash = previousHash;
      this.hash = this.calculateHash();
      this.nonce = 0; // Nonce for mining
      this.mined = false; // Track if block is mined
    }

    // Calculate SHA-256 hash
    async calculateHash() {
      const dataToHash =
        this.index +
        this.previousHash +
        this.timestamp +
        JSON.stringify(this.data) +
        this.nonce;
      const encoder = new TextEncoder();
      const data = encoder.encode(dataToHash);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer)); // Convert buffer to byte array
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""); // Convert bytes to hex string
      return hashHex;
    }

    // Mine the block (find a hash starting with the difficulty prefix)
    async mineBlock(difficulty) {
      const startTime = performance.now();
      this.nonce = 0;
      let hash = await this.calculateHash();

      // Add mining animation to block if it exists
      const blockElement = document.getElementById(`block-${this.index}`);
      if (blockElement) {
        blockElement.classList.add("mining");

        // Add mining progress bar
        const progressBar = document.createElement("div");
        progressBar.className = "mining-progress";
        blockElement.appendChild(progressBar);
      }

      while (hash.substring(0, difficulty.length) !== difficulty) {
        this.nonce++;
        hash = await this.calculateHash();
        if (this.nonce % 1000 === 0) {
          this.updateMiningProgressUI();
        }
      }

      const endTime = performance.now();
      miningTimes.push(endTime - startTime);

      // Remove mining animations if block element exists
      if (blockElement) {
        blockElement.classList.remove("mining");
        const progressBar = blockElement.querySelector(".mining-progress");
        if (progressBar) {
          progressBar.remove();
        }
      }

      this.hash = hash;
      this.mined = true;
      console.log(
        `Block ${this.index} mined: ${this.hash} (Nonce: ${this.nonce})`
      );
      this.updateUI();

      const nextBlockIndex = this.index + 1;
      if (blockchain[nextBlockIndex]) {
        blockchain[nextBlockIndex].previousHash = this.hash;
        blockchain[nextBlockIndex].updateUI();
      }

      validateChain();
      updateChainStats();
      updateNetworkVisualization();
    }

    // Update the visual representation of this block
    async updateUI() {
      const blockElement = document.getElementById(`block-${this.index}`);
      if (!blockElement) return;

      blockElement.querySelector(".block-data").value = this.data;
      blockElement.querySelector(".nonce-input").value = this.nonce;
      blockElement.querySelector(".prev-hash-value").textContent =
        this.previousHash;

      // Add hash update animation
      const hashValueEl = blockElement.querySelector(".hash-value");
      hashValueEl.classList.add("updating");

      // Recalculate current hash display based on current data/nonce
      const currentHash = await this.calculateHash();
      hashValueEl.textContent = currentHash;

      // Remove hash update animation after a delay
      setTimeout(() => {
        hashValueEl.classList.remove("updating");
      }, 500);

      // Style based on mined status and hash validity
      blockElement.classList.toggle("mined", this.mined);
      blockElement.classList.toggle(
        "invalid",
        this.mined && currentHash !== this.hash
      );

      // Check previous hash match visually (only for blocks > 0)
      const prevHashEl = blockElement.querySelector(".prev-hash-value");
      if (this.index > 0) {
        const actualPrevHash = blockchain[this.index - 1].hash;
        prevHashEl.classList.toggle(
          "mismatch",
          this.previousHash !== actualPrevHash
        );
      } else {
        prevHashEl.classList.remove("mismatch");
      }

      // Update add block indicator visibility with animation
      const addBlockIndicator = blockElement.querySelector(
        ".add-block-indicator"
      );
      if (this.index === blockchain.length - 1) {
        addBlockIndicator.classList.add("visible");
      } else {
        addBlockIndicator.classList.remove("visible");
      }

      // Update mine button state with animation
      const mineButton = blockElement.querySelector(".mine-btn");
      if (mineButton) {
        const isHashValid = currentHash.startsWith(difficulty);
        mineButton.disabled = this.mined && isHashValid;
        mineButton.classList.toggle("completed", this.mined && isHashValid);
        mineButton.classList.toggle("mining", this.mined && !isHashValid);
      }
    }

    // Update mining progress UI with animation
    updateMiningProgressUI() {
      const blockElement = document.getElementById(`block-${this.index}`);
      if (blockElement) {
        const nonceInput = blockElement.querySelector(".nonce-input");
        nonceInput.value = this.nonce;
        nonceInput.classList.add("updating");
        setTimeout(() => {
          nonceInput.classList.remove("updating");
        }, 200);
      }
    }
  }

  // --- Blockchain Management ---

  function createGenesisBlock() {
    const genesisTimestamp = new Date().toISOString();
    const genesisBlock = new Block(0, genesisTimestamp, "Genesis Block", "0");
    // Pre-mine the genesis block for convenience in the demo
    genesisBlock.mineBlock(difficulty).then(() => {
      blockchain.push(genesisBlock);
      renderBlock(genesisBlock);
      validateChain(); // Validate after genesis is mined
    });
  }

  async function addNewBlock() {
    // Check if there are any blocks in the chain
    if (blockchain.length === 0) {
      console.error("Cannot add new block: No blocks in chain");
      return;
    }

    // Hide the '+' on the previous last block
    const lastBlock = blockchain[blockchain.length - 1];
    const lastBlockElement = document.getElementById(
      `block-${lastBlock.index}`
    );
    if (lastBlockElement) {
      const lastBlockIndicator = lastBlockElement.querySelector(
        ".add-block-indicator"
      );
      if (lastBlockIndicator) {
        lastBlockIndicator.classList.remove("visible");
      }
    }

    // Create and add the new block
    const newIndex = lastBlock.index + 1;
    const newTimestamp = new Date().toISOString();
    const newData = `Block ${newIndex} Data`;
    const newBlock = new Block(newIndex, newTimestamp, newData, lastBlock.hash);
    blockchain.push(newBlock);
    renderBlock(newBlock);
    validateChain();
    updateChainStats();
    updateNetworkVisualization();
  }

  // --- Rendering Logic ---

  function renderBlock(block) {
    const blockElement = document.createElement("div");
    blockElement.classList.add("block");
    blockElement.id = `block-${block.index}`;

    blockElement.innerHTML = `
            <div class="block-header">Block ${block.index} ${
      block.index === 0 ? "(Genesis)" : ""
    }</div>
            <label for="nonce-${block.index}">Nonce:</label>
            <input type="number" id="nonce-${
              block.index
            }" class="nonce-input" value="${block.nonce}" readonly
            data-tooltip="A number that miners change to find a valid hash. Higher nonce = more attempts.">

            <label for="data-${block.index}">Data:</label>
            <textarea id="data-${block.index}" class="block-data">${
      block.data
    }</textarea>

            <label>Prev. Hash:</label>
            <div class="prev-hash-value" data-tooltip="Links this block to the previous one. Changing data breaks this link.">${
              block.previousHash
            }</div>

            <label>Hash:</label>
            <div class="hash-value" data-tooltip="Unique fingerprint of the block's contents. Must start with ${difficulty} to be valid.">Calculating...</div>

            <div class="button-container">
              <button class="mine-btn" data-index="${
                block.index
              }" data-tooltip="Click to find a valid hash by changing the nonce. This process is called 'mining'. The button becomes disabled once mining is complete.">Mine Block</button>
              <span class="add-block-indicator ${
                block.index === blockchain.length - 1 ? "visible" : ""
              }" data-index="${
      block.index
    }" data-tooltip="Add another block">+</span>
            </div>
        `;

    blockchainContainer.appendChild(blockElement);

    // Add Event Listeners for this specific block
    const dataTextArea = blockElement.querySelector(".block-data");
    const addBlockIndicator = blockElement.querySelector(
      ".add-block-indicator"
    );

    // Tooltip management
    let tooltip = null;
    let tooltipTimeout = null;
    let isScrolling = false;
    let scrollTimeout = null;

    function createTooltip() {
      if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.className = "tooltip";
        document.body.appendChild(tooltip);
      }
    }

    function positionTooltip(element) {
      const rect = element.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Default position (above the element)
      let top = rect.top - tooltipRect.height - 10;
      let left = rect.left + (rect.width - tooltipRect.width) / 2;

      // Check if tooltip would go off the top of the viewport
      if (top < 0) {
        top = rect.bottom + 10; // Position below instead
      }

      // Check if tooltip would go off the left of the viewport
      if (left < 0) {
        left = 0;
      }

      // Check if tooltip would go off the right of the viewport
      if (left + tooltipRect.width > viewportWidth) {
        left = viewportWidth - tooltipRect.width;
      }

      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
    }

    // Track scrolling state
    window.addEventListener("scroll", () => {
      isScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150); // Consider scrolling finished after 150ms of no scroll events
    });

    // Add tooltips to all elements with data-tooltip attribute
    blockElement.querySelectorAll("[data-tooltip]").forEach((element) => {
      let tooltipTimeout = null;
      let isScrolling = false;
      let scrollTimeout = null;

      // Track scrolling state
      window.addEventListener("scroll", () => {
        isScrolling = true;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          isScrolling = false;
        }, 150); // Consider scrolling finished after 150ms of no scroll events
      });

      element.addEventListener("mouseenter", (e) => {
        // Clear any existing timeout
        if (tooltipTimeout) clearTimeout(tooltipTimeout);

        // Set a new timeout to show tooltip after delay
        tooltipTimeout = setTimeout(() => {
          // Only show tooltip if not scrolling
          if (!isScrolling) {
            createTooltip();
            tooltip.textContent = e.target.dataset.tooltip;
            tooltip.classList.add("visible");
            positionTooltip(e.target);
          }
        }, 200); // 200ms delay before showing tooltip
      });

      element.addEventListener("mouseleave", () => {
        // Clear the show timeout if it exists
        if (tooltipTimeout) clearTimeout(tooltipTimeout);

        // Hide tooltip immediately
        if (tooltip) {
          tooltip.classList.remove("visible");
        }
      });

      element.addEventListener("mousemove", (e) => {
        if (tooltip && tooltip.classList.contains("visible")) {
          positionTooltip(e.target);
        }
      });
    });

    // Clean up tooltip on page unload
    window.addEventListener("unload", () => {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    });

    dataTextArea.addEventListener("input", async (e) => {
      block.data = e.target.value; // Update block data object
      block.mined = false; // Changing data invalidates mining
      await block.updateUI(); // Update hash display immediately
      validateChain(); // Check chain validity
    });

    const mineButton = blockElement.querySelector(".mine-btn");

    mineButton.addEventListener("click", async (e) => {
      mineButton.disabled = true; // Disable button while mining
      mineButton.textContent = "Mining...";
      const index = parseInt(e.target.getAttribute("data-index"));
      try {
        await blockchain[index].mineBlock(difficulty); // Start mining
        mineButton.textContent = "Mine Block"; // Reset button text after success
        mineButton.classList.add("completed");
        // Show the add block indicator if this is the last block or genesis block
        if (index === blockchain.length - 1 || index === 0) {
          addBlockIndicator.classList.add("visible");
        }
        // updateUI is called within mineBlock
      } catch (error) {
        console.error("Mining error:", error);
        mineButton.textContent = "Mining Failed"; // Indicate error
        validateChain();
      }
    });

    // Add click handler for the add block indicator
    addBlockIndicator.addEventListener("click", () => {
      addNewBlock();
    });

    // Initial UI update after rendering
    block.updateUI();
  }

  // --- Validation Logic ---

  async function validateChain() {
    let isValid = true;
    for (let i = 0; i < blockchain.length; i++) {
      const currentBlock = blockchain[i];
      const blockElement = document.getElementById(
        `block-${currentBlock.index}`
      );

      // 1. Check if the block itself is mined and its stored hash is correct for its content
      const currentHashRecalculated = await currentBlock.calculateHash();
      let blockIsValid =
        currentBlock.mined &&
        currentBlock.hash.startsWith(difficulty) &&
        currentBlock.hash === currentHashRecalculated;

      // 2. Check if the previous hash link is correct (for blocks > 0)
      let linkIsValid = true;
      if (i > 0) {
        const previousBlock = blockchain[i - 1];
        if (currentBlock.previousHash !== previousBlock.hash) {
          linkIsValid = false;
          blockIsValid = false; // If link is broken, block itself can't be valid in the chain context
        }
        // Update visual indicator for prev hash mismatch
        const prevHashEl = blockElement?.querySelector(".prev-hash-value");
        prevHashEl?.classList.toggle("mismatch", !linkIsValid);
      }

      // Update block visual style (mined/invalid)
      if (blockElement) {
        blockElement.classList.toggle(
          "mined",
          currentBlock.mined && blockIsValid && linkIsValid
        );
        blockElement.classList.toggle("invalid", !blockIsValid || !linkIsValid);

        // Ensure hash value display reflects potential invalidity even if 'mined' flag is true
        const hashValueEl = blockElement.querySelector(".hash-value");
        hashValueEl.textContent = currentHashRecalculated; // Show the *actual* current hash
        hashValueEl.classList.toggle("invalid", !blockIsValid || !linkIsValid);

        // Re-enable mine button if the block is now invalid
        const mineButton = blockElement.querySelector(".mine-btn");
        if (mineButton) {
          mineButton.disabled =
            currentBlock.mined && blockIsValid && linkIsValid;
        }
      }

      if (!blockIsValid || !linkIsValid) {
        isValid = false; // If any block is invalid, the whole chain is invalid
      }
    }

    // Update overall chain status display
    chainStatusEl.innerHTML = `Chain Status: <span class="${
      isValid ? "valid" : "invalid"
    }">${isValid ? "VALID" : "INVALID"}</span>`;
    return isValid;
  }

  // --- Chain Import/Export Functions ---

  function exportChain() {
    const chainData = JSON.stringify(
      blockchain.map((block) => ({
        index: block.index,
        timestamp: block.timestamp,
        data: block.data,
        previousHash: block.previousHash,
        hash: block.hash,
        nonce: block.nonce,
        mined: block.mined,
      }))
    );

    const blob = new Blob([chainData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blockchain.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importChain(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedChain = JSON.parse(event.target.result);
        blockchain = importedChain.map((blockData) => {
          const block = new Block(
            blockData.index,
            blockData.timestamp,
            blockData.data,
            blockData.previousHash
          );
          block.hash = blockData.hash;
          block.nonce = blockData.nonce;
          block.mined = blockData.mined;
          return block;
        });

        // Clear and re-render the blockchain
        blockchainContainer.innerHTML = "";
        blockchain.forEach((block) => renderBlock(block));
        validateChain();
        updateChainStats();
        updateNetworkVisualization();
      } catch (error) {
        alert("Error importing chain: " + error.message);
      }
    };
    reader.readAsText(file);
  }

  // Network visualization
  function updateNetworkVisualization() {
    const canvas = document.getElementById("network-canvas");
    if (!canvas) return; // Exit if canvas doesn't exist

    const ctx = canvas.getContext("2d");
    if (!ctx) return; // Exit if context can't be obtained

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw nodes and connections
    blockchain.forEach((block, index) => {
      const x = (index + 1) * (canvas.width / (blockchain.length + 1));
      const y = canvas.height / 2;

      // Draw connection line
      if (index > 0) {
        ctx.beginPath();
        ctx.moveTo(x - canvas.width / (blockchain.length + 1), y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = block.mined ? "#4CAF50" : "#FF9800";
        ctx.stroke();
      }

      // Draw node
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fillStyle = block.mined ? "#4CAF50" : "#FF9800";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.stroke();

      // Draw block number
      ctx.fillStyle = "#fff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(block.index, x, y + 4);
    });
  }

  // Chain statistics
  function updateChainStats() {
    totalBlocksEl.textContent = blockchain.length;
    if (miningTimes.length > 0) {
      const avgTime = Math.round(
        miningTimes.reduce((a, b) => a + b, 0) / miningTimes.length
      );
      avgMiningTimeEl.textContent = avgTime;
    }
  }

  // --- Initialization ---

  function initializeBlockchain() {
    // Get DOM elements
    const blockchainContainer = document.getElementById("blockchain");
    const addBlockBtn = document.getElementById("add-block-btn");
    const exportChainBtn = document.getElementById("export-chain-btn");
    const importChainBtn = document.getElementById("import-chain-btn");
    const chainStatusEl = document.getElementById("chain-status");
    const totalBlocksEl = document.getElementById("total-blocks");
    const avgMiningTimeEl = document.getElementById("avg-mining-time");
    const networkVisualizationEl = document.getElementById(
      "network-visualization"
    );
    const networkCanvas = document.getElementById("network-canvas");
    const difficultySelect = document.getElementById("difficulty-select");
    const themeToggle = document.getElementById("theme-toggle");

    // Initialize variables
    let difficulty = difficultySelect?.value || "000"; // Default to "000" if not found
    let blockchain = [];
    let miningTimes = [];

    // Add event listeners if elements exist
    if (addBlockBtn) {
      addBlockBtn.addEventListener("click", addNewBlock);
    }
    if (exportChainBtn) {
      exportChainBtn.addEventListener("click", exportChain);
    }
    if (importChainBtn) {
      importChainBtn.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
          const file = e.target.files[0];
          importChain(file);
        };
        input.click();
      });
    }
    if (difficultySelect) {
      difficultySelect.addEventListener("change", (e) => {
        difficulty = e.target.value;
        // Invalidate all blocks when difficulty changes
        blockchain.forEach((block) => {
          block.mined = false;
          block.updateUI();
        });
        validateChain();
      });
    }
    if (themeToggle) {
      themeToggle.addEventListener("click", toggleTheme);
    }

    // Initialize network visualization if elements exist
    if (networkVisualizationEl && networkCanvas) {
      networkVisualizationEl.classList.remove("hidden");
      networkCanvas.width = networkCanvas.offsetWidth;
      networkCanvas.height = networkCanvas.offsetHeight;

      // Handle window resize for network visualization
      window.addEventListener("resize", () => {
        networkCanvas.width = networkCanvas.offsetWidth;
        networkCanvas.height = networkCanvas.offsetHeight;
        updateNetworkVisualization();
      });
    }

    // Create genesis block
    createGenesisBlock();

    // Update initial stats
    updateChainStats();
  }

  // Initialize tabs first
  initializeTabs();

  // Then initialize blockchain
  initializeBlockchain();

  // Finally highlight code
  Prism.highlightAll();
});
