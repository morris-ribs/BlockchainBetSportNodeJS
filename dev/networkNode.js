const bodyParser = require ("body-parser");
const express = require ("express");
const rp = require("request-promise");

const Blockchain = require ("./blockchain");

const app = express();

// process.argv refers to the script run by 'npm start' (check package.json)
const port = process.argv[2];

const bitcoin = new Blockchain();

app.use(bodyParser.json()); // parse JSON data from body
app.use(bodyParser.urlencoded({ extended: false })); // parse form data from body


// fetch entire blockchain
app.get("/blockchain", function (req, res) {
    res.send(bitcoin);
});


// registers a new bet into this node
app.post("/bet", function (req, res) {
    const newBet = req.body;
    const blockIndex = bitcoin.addBetToPendingBets(newBet);
    res.json({ note: `Bet will be added in block ${blockIndex}.` });
});

// broadcast a new bet
app.post("/bet/broadcast", function (req, res) {
    const newBet = bitcoin.createNewBet(req.body.playerName, req.body.matchId, req.body.teamOneScore,
        req.body.teamTwoScore);
    bitcoin.addBetToPendingBets(newBet);
    
    const requestPromises = [];

    // broadcast bet into the network
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + "/bet",
            method: "POST",
            body: newBet,
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(data => {
        res.json({ note: "Bet created and broadcast successfully." });
    });
});

// mines a new block
app.get("/mine", function (req, res) {
    const lastBlock = bitcoin.getLastBlock();
    const previousBlockHash = lastBlock["hash"];
    const currentBlockData = {
        bets: bitcoin.pendingBets,
        index: lastBlock["index"] - 1
    };

    const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);

    const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);
    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + "/receive-new-block",
            method: "POST",
            body: { newBlock: newBlock },
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    res.json({
        note: "New block mined and broadcast successfully",
        block: newBlock
    });
});

app.post("/receive-new-block", function (req, res) {
    const newBlock = req.body.newBlock;
    const lastBlock = bitcoin.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock["index"] + 1 === newBlock["index"];

    if (correctHash && correctIndex) {
        bitcoin.chain.push(newBlock);
        bitcoin.pendingBets = [];

        res.json({
            note: "New block received and accepted.",
            newBlock: newBlock
        });
    } else {
        res.json({
            note: "New block rejected.",
            newBlock: newBlock
        });
    }
});

// register and broadcast node
app.post("/register-and-broadcast-node", function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    if (bitcoin.networkNodes.indexOf(newNodeUrl) == -1) {
        bitcoin.networkNodes.push(newNodeUrl);
    }
    
    const regNodesPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + "/register-node",
            method: "POST",
            body: { newNodeUrl: newNodeUrl },
            json: true
        };
        regNodesPromises.push(rp(requestOptions));
    });

    Promise.all(regNodesPromises)
    .then(data => {
        const bulkRegisterOptions = {
            uri: newNodeUrl + "/register-nodes-bulk",
            method: "POST",
            body: { allNetworkNodes: [ ...bitcoin.networkNodes, bitcoin.currentNodeUrl ] },
            json: true
        };

        return rp(bulkRegisterOptions);
    })
    .then(data => {
        res.json({ note: "New node registered with network successfully." });
    });
});

// register a single node
app.post("/register-node", function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
    const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
    if (nodeNotAlreadyPresent && notCurrentNode) {
        bitcoin.networkNodes.push(newNodeUrl);
    }
    res.json({ note: "New node registered successfully." });
});

// register multiple nodes at once
app.post("/register-nodes-bulk", function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
        const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
        const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;
        if (nodeNotAlreadyPresent && notCurrentNode) {
            bitcoin.networkNodes.push(networkNodeUrl);
        }
    });
    res.json({ note: "Bulk registration successful." });
});
 
// consensus
app.get("/consensus", function (req, res) {
    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + "/blockchain",
            method: "GET",
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(blockchains => {
        const currentChainLength = bitcoin.chain.length;
        let maxChainLength = currentChainLength;
        let newLongestChain = null;
        let newPendingBets = null;

        blockchains.forEach(blockchain => {
            if (blockchain.chain.length > maxChainLength) {
                maxChainLength = blockchain.chain.length;
                newLongestChain = blockchain.chain;
                newPendingBets = blockchain.pendingBets;
            }
        });

        if (!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))) {
            res.json({ 
                note: "Current chain has not been replaced.", 
                chain: bitcoin.chain  
            });
        } else {
            bitcoin.chain = newLongestChain;
            bitcoin.pendingBets = newPendingBets;
            res.json({ 
                note: "This chain has been replaced.", 
                chain: bitcoin.chain  
            });
        }
    });
});

// get a certain block
app.get("/block/:blockHash", function(req, res) { // localhost:3001/block/euiswrifjreiwfjo
    const blockHash = req.params.blockHash;
    const correctBlock = bitcoin.getBlock(blockHash);
    res.json({
        block: correctBlock
    });
});

// get bets for a specific match
app.get("/match/:matchId", function(req, res) {
    const matchId = req.params.matchId;
    const bets = bitcoin.getBetsForMatch(matchId);
    res.json({
        betsData: bets
    });
});

// get player's bets
app.get("/player/:playerName", function(req, res) {
    const playerName = req.params.playerName;
    const bets = bitcoin.getPlayerBets(playerName);
    res.json({
        betsData: bets
    });
});


app.get("/block-explorer", function (req, res) {
    res.sendFile("./block-explorer/index.html", { root: __dirname });
});

// bind
app.listen(port, () => {
    console.log(`Listening on port ${port}...`);
});