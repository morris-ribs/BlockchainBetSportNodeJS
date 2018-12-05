const sha256 = require("sha256");
const uuid = require("uuid/v1");
const currentNodeUrl = process.argv[3];

function Blockchain() {
  this.chain = [];
  this.pendingBets = [];
  this.currentNodeUrl = currentNodeUrl;
  this.networkNodes = []; // all nodes in the network
  
  // creating genesis block
   this.createNewBlock(100, "0", "0");
}

Blockchain.prototype.createNewBlock = function(nonce, previousBlockHash, hash) {
  const newBlock = {
    index: this.chain.length + 1,
    timestamp: Date.now(),
    bets: this.pendingBets,
    nonce: nonce,
    hash: hash,
    previousBlockHash: previousBlockHash
  };

  this.pendingBets = [];
  this.chain.push(newBlock);

  return newBlock;
};


Blockchain.prototype.getLastBlock = function() {
  return this.chain[this.chain.length - 1];
};

Blockchain.prototype.createNewBet = function (playerName, matchId, teamOneScore, teamTwoScore) {
  const newBet = {
    player: playerName, 
    matchId: matchId, 
    betId: uuid().split("-").join("")
  };

  newBet["teamOne"] = teamOneScore;
  newBet["teamTwo"] = teamTwoScore;

  return newBet;
};

Blockchain.prototype.addBetToPendingBets = function (betObj) {
  this.pendingBets.push(betObj);
  return this.getLastBlock()["index"] + 1;
};

Blockchain.prototype.hashBlock = function(previousBlockHash, currentBlockData, nonce) {
  const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
  const hash = sha256(dataAsString);
  return hash;
};

Blockchain.prototype.proofOfWork = function(previousBlockHash, currentBlockData) {
  let nonce = 0;
  let hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
  
  // repeatedly hashes a block until it finds correct hash (starting with four zeros) => '0000XXXXXXXX' 
  // uses both current and previous block hash  
  while (hash.substring(0,4) !== "0000") {
    // continuously changes nonce value until it finds the correct hash
    hash = this.hashBlock(previousBlockHash, currentBlockData, ++nonce);
  }
  
  // returns the nonce value that creates the correct hash
  return nonce;
};

Blockchain.prototype.chainIsValid = function(blockchain) {
  for (var i = 1; i < blockchain.length; i++) {
    const currentBlock = blockchain[i];
    const prevBlock = blockchain[i - 1];
    const blockHash = this.hashBlock(prevBlock["hash"], { bets: (currentBlock["bets"] || []), index: prevBlock["index"] - 1 }, currentBlock["nonce"]);

    if (blockHash.substring(0, 4) !== "0000") {
      return false;
    }

    if (currentBlock["previousBlockHash"] !== prevBlock["hash"]) {
      return false;
    }
  }

  const genesisBlock = blockchain[0];
  const correctNonce = genesisBlock["nonce"] === 100;
  const correctPreviousBlockHash = genesisBlock["previousBlockHash"] === "0";
  const correctHash = genesisBlock["hash"] === "0";
  const correctBets = genesisBlock["bets"].length === 0;

  if (!correctNonce || !correctPreviousBlockHash || !correctHash || !correctBets) {
    return false;
  }

  return true;
};

Blockchain.prototype.getBlock = function(blockHash) {
  let correctBlock = null;
  this.chain.forEach(block => {
    if (block.hash === blockHash) {
      correctBlock = block;
      return;
    }
  });

  return correctBlock;
};

Blockchain.prototype.getBetsForMatch = function(matchId) {
  const matchBets = [];
  this.chain.forEach(block => {
    block.bets.forEach(bet => {
      if (bet.matchId === matchId) {
        matchBets.push(bet);
      }
    });
  });

  return matchBets;
};

// gets all the bets of a player
Blockchain.prototype.getPlayerBets = function(playerName) {
  const playerBets = [];
  this.chain.forEach(block => {
    block.bets.forEach(bet => {
      if (bet.player === playerName) {
        playerBets.push(bet);
      }
    });
  });

  return playerBets;
};

module.exports = Blockchain;