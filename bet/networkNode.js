const bodyParser = require ("body-parser");
const express = require ("express");
const rp = require("request-promise");

const Blockchain = require ("./blockchain");

const app = express();

// process.argv refers to the script run by 'npm start' (check package.json)
const port = process.argv[2];

const blockchain = new Blockchain();

app.use(bodyParser.json()); // parse JSON data from body
app.use(bodyParser.urlencoded({ extended: false })); // parse form data from body
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next(); 
});

// fetch entire blockchain
app.get("/blockchain", function (req, res) { 
    res.send(blockchain);
});


// registers a new bet into this node
app.post("/bet", function (req, res) {
    const newBet = req.body;
    const blockIndex = blockchain.addBetToPendingBets(newBet);
    res.json({ note: `Bet will be added in block ${blockIndex}.` });
});

// broadcast a new bet 
app.post("/bet/broadcast", function (req, res) {
    const obj = Object.keys(req.body).length === 1 ? JSON.parse(Object.keys(req.body)[0]) : req.body;
    const newBet = blockchain.createNewBet(obj.playername, obj.matchid, obj.teamonescore,
        obj.teamtwoscore);
    blockchain.addBetToPendingBets(newBet);
    
    const requestPromises = [];

    // broadcast bet into the network
    blockchain.networkNodes.forEach(networkNodeUrl => {
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
    const lastBlock = blockchain.getLastBlock();
    const previousBlockHash = lastBlock["hash"];
    const currentBlockData = {
        bets: blockchain.pendingBets,
        index: lastBlock["index"] - 1
    };

    const nonce = blockchain.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = blockchain.hashBlock(previousBlockHash, currentBlockData, nonce);

    const newBlock = blockchain.createNewBlock(nonce, previousBlockHash, blockHash);
    const requestPromises = [];
    blockchain.networkNodes.forEach(networkNodeUrl => {
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
    const lastBlock = blockchain.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock["index"] + 1 === newBlock["index"];

    if (correctHash && correctIndex) {
        blockchain.chain.push(newBlock);
        blockchain.pendingBets = [];

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
    if (blockchain.networkNodes.indexOf(newNodeUrl) == -1) {
        blockchain.networkNodes.push(newNodeUrl);
    }
    
    const regNodesPromises = [];
    blockchain.networkNodes.forEach(networkNodeUrl => {
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
            body: { allNetworkNodes: [ ...blockchain.networkNodes, blockchain.currentNodeUrl ] },
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
    const nodeNotAlreadyPresent = blockchain.networkNodes.indexOf(newNodeUrl) == -1;
    const notCurrentNode = blockchain.currentNodeUrl !== newNodeUrl;
    if (nodeNotAlreadyPresent && notCurrentNode) {
        blockchain.networkNodes.push(newNodeUrl);
    }
    res.json({ note: "New node registered successfully." });
});

// register multiple nodes at once
app.post("/register-nodes-bulk", function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
        const nodeNotAlreadyPresent = blockchain.networkNodes.indexOf(networkNodeUrl) == -1;
        const notCurrentNode = blockchain.currentNodeUrl !== networkNodeUrl;
        if (nodeNotAlreadyPresent && notCurrentNode) {
            blockchain.networkNodes.push(networkNodeUrl);
        }
    });
    res.json({ note: "Bulk registration successful." });
});
 
// consensus
app.get("/consensus", function (req, res) {
    const requestPromises = [];
    blockchain.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + "/blockchain",
            method: "GET",
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(blockchains => {
        const currentChainLength = blockchain.chain.length;
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

        if (!newLongestChain || (newLongestChain && !blockchain.chainIsValid(newLongestChain))) {
            res.json({ 
                note: "Current chain has not been replaced.", 
                chain: blockchain.chain  
            });
        } else {
            blockchain.chain = newLongestChain;
            blockchain.pendingBets = newPendingBets;
            res.json({ 
                note: "This chain has been replaced.", 
                chain: blockchain.chain  
            });
        }
    });
});

// get a certain block
app.get("/block/:blockHash", function(req, res) { // localhost:3001/block/euiswrifjreiwfjo
    const blockHash = req.params.blockHash;
    const correctBlock = blockchain.getBlock(blockHash);
    res.json({
        block: correctBlock
    });
});

// get bets for a specific match
app.get("/match/:matchId", function(req, res) {
    const matchId = req.params.matchId;
    const bets = blockchain.getBetsForMatch(matchId);
    res.json({
        betsData: bets
    });
});

// get player's bets
app.get("/player/:playerName", function(req, res) {
    const playerName = req.params.playerName;
    const bets = blockchain.getPlayerBets(playerName);
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