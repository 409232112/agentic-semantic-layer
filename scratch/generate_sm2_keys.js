const sm2 = require('sm-crypto').sm2;

let keypair = sm2.generateKeyPairHex();
console.log("SM2 Public Key:", keypair.publicKey);
console.log("SM2 Private Key:", keypair.privateKey);
