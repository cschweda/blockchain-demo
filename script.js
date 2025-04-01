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

  const difficulty = "00"; // Hash must start with this
  let blockchain = [];
  let miningTimes = []; // Track mining times for statistics

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

      while (hash.substring(0, difficulty.length) !== difficulty) {
        this.nonce++;
        hash = await this.calculateHash();
        if (this.nonce % 1000 === 0) {
          this.updateMiningProgressUI();
        }
      }

      const endTime = performance.now();
      miningTimes.push(endTime - startTime);

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

    // Helper to update UI during mining (shows nonce changes)
    updateMiningProgressUI() {
      const blockElement = document.getElementById(`block-${this.index}`);
      if (blockElement) {
        blockElement.querySelector(".nonce-input").value = this.nonce;
        // Maybe add a temporary "mining..." status
      }
    }

    // Update the visual representation of this block
    async updateUI() {
      const blockElement = document.getElementById(`block-${this.index}`);
      if (!blockElement) return;

      blockElement.querySelector(".block-data").value = this.data;
      blockElement.querySelector(".nonce-input").value = this.nonce;
      blockElement.querySelector(".prev-hash-value").textContent =
        this.previousHash;

      // Recalculate current hash display based on current data/nonce
      const currentHash = await this.calculateHash();
      const hashValueEl = blockElement.querySelector(".hash-value");
      hashValueEl.textContent = currentHash;

      // Style based on mined status and hash validity
      blockElement.classList.toggle("mined", this.mined);
      blockElement.classList.toggle(
        "invalid",
        this.mined && currentHash !== this.hash
      ); // Invalid if mined but current calc doesn't match stored hash

      // Check previous hash match visually (only for blocks > 0)
      const prevHashEl = blockElement.querySelector(".prev-hash-value");
      if (this.index > 0) {
        const actualPrevHash = blockchain[this.index - 1].hash;
        prevHashEl.classList.toggle(
          "mismatch",
          this.previousHash !== actualPrevHash
        );
        // Ensure the internal previousHash matches reality if the previous block was just mined/changed
        if (this.previousHash !== actualPrevHash) {
          // This indicates a break, validateChain handles the overall status
          // but we might need to update this block's internal prevHash if the user intends to re-mine *this* one.
          // For simplicity now, we rely on validateChain and re-mining.
        }
      } else {
        prevHashEl.classList.remove("mismatch"); // Genesis block prev hash is always "0"
      }

      // Disable mine button if already mined and valid, or enable if not mined/invalidated
      const mineButton = blockElement.querySelector(".mine-btn");
      mineButton.disabled = this.mined && currentHash === this.hash;
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
    const lastBlock = blockchain[blockchain.length - 1];
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
            }" class="nonce-input" value="${block.nonce}" readonly>

            <label for="data-${block.index}">Data:</label>
            <textarea id="data-${block.index}" class="block-data">${
      block.data
    }</textarea>

            <label>Prev. Hash:</label>
            <div class="prev-hash-value">${block.previousHash}</div>

            <label>Hash:</label>
            <div class="hash-value">Calculating...</div>

            <button class="mine-btn" data-index="${
              block.index
            }">Mine Block</button>
        `;

    blockchainContainer.appendChild(blockElement);

    // Add Event Listeners for this specific block
    const dataTextArea = blockElement.querySelector(".block-data");
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
        // updateUI is called within mineBlock
      } catch (error) {
        console.error("Mining error:", error);
        mineButton.textContent = "Mining Failed"; // Indicate error
        // Re-enable button maybe? Or leave disabled if state is bad.
        // For now, leave potentially disabled, relies on user fixing data/retrying.
        validateChain();
      }
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

  // --- New Features ---

  // Export chain functionality
  exportChainBtn.addEventListener("click", () => {
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
  });

  // Import chain functionality
  importChainBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
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
    };
    input.click();
  });

  // Network visualization
  function updateNetworkVisualization() {
    const ctx = networkCanvas.getContext("2d");
    const width = networkCanvas.width;
    const height = networkCanvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw blocks and connections
    blockchain.forEach((block, index) => {
      const x = (width / (blockchain.length + 1)) * (index + 1);
      const y = height / 2;

      // Draw block
      ctx.fillStyle = block.mined ? "#28a745" : "#dc3545";
      ctx.fillRect(x - 30, y - 30, 60, 60);

      // Draw block number
      ctx.fillStyle = "white";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(block.index, x, y + 4);

      // Draw connection to previous block
      if (index > 0) {
        const prevX = (width / (blockchain.length + 1)) * index;
        ctx.beginPath();
        ctx.moveTo(prevX, y);
        ctx.lineTo(x - 30, y);
        ctx.strokeStyle =
          block.previousHash === blockchain[index - 1].hash
            ? "#28a745"
            : "#dc3545";
        ctx.stroke();
      }
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
  addBlockBtn.addEventListener("click", addNewBlock);
  createGenesisBlock();

  // Initialize network visualization
  networkVisualizationEl.classList.remove("hidden");
  networkCanvas.width = networkCanvas.offsetWidth;
  networkCanvas.height = networkCanvas.offsetHeight;

  // Handle window resize for network visualization
  window.addEventListener("resize", () => {
    networkCanvas.width = networkCanvas.offsetWidth;
    networkCanvas.height = networkCanvas.offsetHeight;
    updateNetworkVisualization();
  });
});
