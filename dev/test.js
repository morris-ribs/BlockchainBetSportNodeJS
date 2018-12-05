const Blockchain = require ("./blockchain");
const bitcoin = new Blockchain();

const bc1 = {
    "chain": [
        {
            "index": 1,
            "timestamp": 1541174123944,
            "bets": [],
            "nonce": 100,
            "hash": "0",
            "previousBlockHash": "0"
        },
        {
            "index": 2,
            "timestamp": 1541174132474,
            "bets": [],
            "nonce": 10456,
            "hash": "0000e27f4d52a5d17d8d3eeaf93ab037e173d09412f018bf0da085bfd72d66c3",
            "previousBlockHash": "0"
        },
        {
            "index": 3,
            "timestamp": 1541174213000,
            "bets": [
                {
                    "player": "Mauricio",
                    "matchId": "PtCh",
                    "teamOne": 1,
                    "teamTwo" : 1
                }
            ],
            "nonce": 71295,
            "hash": "0000f5bbb48fd040c3702bf3d7c91bbec3b998983e641ae48f4bd0aeeb4d3c76",
            "previousBlockHash": "0000e27f4d52a5d17d8d3eeaf93ab037e173d09412f018bf0da085bfd72d66c3"
        }
    ],
    "pendingbets": [],
    "currentNodeUrl": "http://localhost:3001",
    "networkNodes": []
};

console.log("VALID: " + bitcoin.chainIsValid(bc1.chain));
