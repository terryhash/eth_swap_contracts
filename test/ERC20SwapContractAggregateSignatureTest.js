const ERC20SwapContractAggregateSignature = artifacts.require('../contracts/ERC20SwapContractAggregateSignature.sol');
const TestToken = artifacts.require('../contracts/TestToken.sol');

contract('ERC20SwapContractAggregateSignature', function (accounts) {
    let contractSwap;
    let contractToken;
    let owner = accounts[0];
    let supply = BigInt(100000000000000000000); // 100 TEST coins

    beforeEach(async () => {
        contractSwap = await ERC20SwapContractAggregateSignature.new();
        contractToken = await TestToken.new(supply);
    });

    it('should approve properly', async () => {
        let value = 100;

        await contractToken.approve(contractSwap.address, value);

        let balance = await contractToken.balanceOf(owner);
        assert.equal(BigInt(balance), BigInt(supply));

        let allowance = await contractToken.allowance(owner, contractSwap.address);
        assert.equal(allowance, value);
    });

    it('should initiate', async () => {
        let addressFromSecret = '0x1000000000000000000000000000000000000001';
        let participant = '0x2000000000000000000000000000000000000002';
        let sender = accounts[0];
        let value = 500;
        let refundTimeInBlocks = 333;

        let swapDetails = await contractSwap.getSwapDetails(addressFromSecret);
        let contractBalance = await contractToken.balanceOf(contractSwap.address);

        assert.equal(swapDetails.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swapDetails.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(contractBalance, 0);

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        swapDetails = await contractSwap.getSwapDetails(addressFromSecret);
        contractBalance = await contractToken.balanceOf(contractSwap.address);

        assert.equal(swapDetails.initiator, sender);
        assert.equal(swapDetails.participant, participant);
        assert.deepEqual(BigInt(swapDetails.value), BigInt(value));
        assert.deepEqual(BigInt(swapDetails.refundTimeInBlocks), BigInt(refundTimeInBlocks));
        assert.equal(swapDetails.contractAddress, contractToken.address);
        assert.equal(contractBalance, value);
    });

    it('should not initiate duplicate', async () => {
        let addressFromSecret = '0x1000000000000000000000000000000000000001';
        let participant = '0x2000000000000000000000000000000000000002';
        let sender = accounts[0];
        let value = 500;
        let refundTimeInBlocks = 333;

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        try {
            await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is already initiated') >= 0);
        }

    });

    it("should not initiate with empty participant's address", async () => {
        let addressFromSecret = '0x1000000000000000000000000000000000000001';
        let participant = '0x0000000000000000000000000000000000000000';
        let sender = accounts[0];
        let value = 500;
        let refundTimeInBlocks = 333;

        await contractToken.approve(contractSwap.address, value);

        try {
            await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid participant address') >= 0);
        }
    });

    it("should not initiate with expired refundTimeInBlocks", async () => {
        let addressFromSecret = '0x4fd44e9919635435cb60e8d0aa0a26cc016f2b99';
        let participant = '0xa6a2c2fea95702877b9b9a1246bd6d7e0cb7c9e8';
        let sender = accounts[0];
        let value = 500;
        let refundTimeInBlocks = 0;

        await contractToken.approve(contractSwap.address, value);
        
        try {
            await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimeInBlocks has already come') >= 0);
        }
    });

    it('should redeem properly', async () => {
        const secret = "0x59cf604a0581191f30605dac02eee2e363b82bc8fb2bcc6aa3eaf11fa6315441";
        let secretAccount = await web3.eth.accounts.privateKeyToAccount(secret);
        // 0xc05955ecdc22E027f2094Fe8F8266B5a88270d56
        let addressFromSecret = secretAccount.address;

        let participant = accounts[1];
        let sender = accounts[0];
        let value = 500;
        let latestBlock = await web3.eth.getBlock("latest")
        let refundTimeInBlocks = latestBlock.number + 10;

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        let swapDetails = await contractSwap.getSwapDetails(addressFromSecret);
        let contractSwapBalance = await contractToken.balanceOf(contractSwap.address);

        assert.equal(swapDetails.initiator, sender);
        assert.equal(swapDetails.participant, participant);
        assert.deepEqual(BigInt(swapDetails.value), BigInt(value));
        assert.deepEqual(BigInt(swapDetails.refundTimeInBlocks), BigInt(refundTimeInBlocks));
        assert.equal(swapDetails.contractAddress, contractToken.address);
        assert.equal(contractSwapBalance, value);

        let participantBalance = await contractToken.balanceOf(participant);

        const hash = web3.utils.soliditySha3(
            {t : 'address', v : addressFromSecret},
            {t : 'address', v : participant},
            {t : 'address', v : sender},
            {t : 'uint256', v : refundTimeInBlocks},
            {t : 'address', v : contractToken.address});

        let prefix = "\x19Ethereum Signed Message:\n32";
        const hash3 = web3.utils.soliditySha3(
            {t: 'string', v: prefix},
            {t: 'bytes32', v: hash});

        const sig = await secretAccount.sign(hash);

        await contractSwap.redeem(addressFromSecret, sig.r, sig.s, sig.v, {from: participant, value: 0});

        contractSwapBalance = await contractToken.balanceOf(contractSwap.address);
        swapDetails = await contractSwap.getSwapDetails(addressFromSecret);

        assert.equal(swapDetails.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swapDetails.participant, '0x0000000000000000000000000000000000000000');
        assert.deepEqual(BigInt(swapDetails.value), BigInt(0));
        assert.deepEqual(BigInt(swapDetails.refundTimeInBlocks), BigInt(0));
        assert.equal(contractSwapBalance, 0);

        let new_participantBalance = await contractToken.balanceOf(participant);

        assert.deepEqual(BigInt(new_participantBalance), BigInt(participantBalance) + BigInt(value));
    });

    it('should not redeem twice', async () => {
        const secret = "0x59cf604a0581191f30605dac02eee2e363b82bc8fb2bcc6aa3eaf11fa6315441";
        let secretAccount = await web3.eth.accounts.privateKeyToAccount(secret);
        // 0xc05955ecdc22E027f2094Fe8F8266B5a88270d56
        let addressFromSecret = secretAccount.address;

        let participant = accounts[1];
        let sender = accounts[0];
        let value = 500;
        let latestBlock = await web3.eth.getBlock("latest")
        let refundTimeInBlocks = latestBlock.number + 10;

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        const hash = web3.utils.soliditySha3(
            {t : 'address', v : addressFromSecret},
            {t : 'address', v : participant},
            {t : 'address', v : sender},
            {t : 'uint256', v : refundTimeInBlocks},
            {t : 'address', v : contractToken.address});

        let prefix = "\x19Ethereum Signed Message:\n32";
        const hash3 = web3.utils.soliditySha3(
            {t: 'string', v: prefix},
            {t: 'bytes32', v: hash});

        const sig = await secretAccount.sign(hash);

        await contractSwap.redeem(addressFromSecret, sig.r, sig.s, sig.v, {from: participant, value: 0});

        try {
            await contractSwap.redeem(addressFromSecret, sig.r, sig.s, sig.v, {from: participant, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid msg.sender') >= 0);
        }
    });

    it('should not redeem with wrong msg.sender', async () => {
        const secret = "0x59cf604a0581191f30605dac02eee2e363b82bc8fb2bcc6aa3eaf11fa6315441";
        let secretAccount = await web3.eth.accounts.privateKeyToAccount(secret);
        // 0xc05955ecdc22E027f2094Fe8F8266B5a88270d56
        let addressFromSecret = secretAccount.address;

        let participant = accounts[1];
        let sender = accounts[0];
        let value = 500;
        let latestBlock = await web3.eth.getBlock("latest")
        let refundTimeInBlocks = latestBlock.number + 10;

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        const hash = web3.utils.soliditySha3(
            {t : 'address', v : addressFromSecret},
            {t : 'address', v : participant},
            {t : 'address', v : sender},
            {t : 'uint256', v : refundTimeInBlocks},
            {t : 'address', v : contractToken.address});

        let prefix = "\x19Ethereum Signed Message:\n32";
        const hash3 = web3.utils.soliditySha3(
            {t: 'string', v: prefix},
            {t: 'bytes32', v: hash});

        const sig = await secretAccount.sign(hash);

        try
        {
            // use wrong redeemer
            await contractSwap.redeem(addressFromSecret, sig.r, sig.s, sig.v, {from: accounts[2], value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid msg.sender') >= 0);
        }
    });

    it('should not redeem with wrong signature', async () => {
        const secret = "0x59cf604a0581191f30605dac02eee2e363b82bc8fb2bcc6aa3eaf11fa6315441";
        let secretAccount = await web3.eth.accounts.privateKeyToAccount(secret);
        // 0xc05955ecdc22E027f2094Fe8F8266B5a88270d56
        let addressFromSecret = secretAccount.address;

        let participant = accounts[1];
        let sender = accounts[0];
        let value = 500;
        let latestBlock = await web3.eth.getBlock("latest")
        let refundTimeInBlocks = latestBlock.number + 10;

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        const hash = web3.utils.soliditySha3(
            {t : 'address', v : addressFromSecret},
            {t : 'address', v : participant},
            {t : 'address', v : sender},
            {t : 'uint256', v : refundTimeInBlocks},
            {t : 'address', v : contractToken.address});

        let prefix = "\x19Ethereum Signed Message:\n32";
        const hash3 = web3.utils.soliditySha3(
            {t: 'string', v: prefix},
            {t: 'bytes32', v: hash});

        // sign by wrong secret
        const sig = await web3.eth.accounts.sign(hash, "f26b34783a5f8b16b11bde493c37989afba93562379b04db544518eb07555943");

        try
        {
            await contractSwap.redeem(addressFromSecret, sig.r, sig.s, sig.v, {from: participant, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid address') >= 0);
        }
    });

    it('should not refund non-exist swap', async () => { 
        let addressFromSecret = '0x4fd44e9919635435cb60e8d0aa0a26cc016f2b99';

        try
        {
            await contractSwap.refund(addressFromSecret, {from: accounts[0], value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid msg.sender') >= 0);
        }       
    });

    it('should refund properly', async () => {
        let addressFromSecret = '0xc05955ecdc22E027f2094Fe8F8266B5a88270d56';
        let participant = accounts[1];
        let sender = accounts[0];
        let value = 500;
        let latestBlock = await web3.eth.getBlock("latest")
        let refundTimeInBlocks = latestBlock.number + 3;

        let senderBalance = await contractToken.balanceOf(sender);

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        await contractSwap.refund(addressFromSecret, {from: sender, value: 0});

        // check balance and contract state
        let contractBalance = await contractToken.balanceOf(contractSwap.address);
        let swapDetails = await contractSwap.getSwapDetails(addressFromSecret);
        let newSenderBalance = await contractToken.balanceOf(sender);

        assert.equal(swapDetails.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swapDetails.participant, '0x0000000000000000000000000000000000000000');
        assert.deepEqual(BigInt(swapDetails.value), BigInt(0));
        assert.deepEqual(BigInt(swapDetails.refundTimeInBlocks), BigInt(0));
        assert.equal(contractBalance, 0);

        assert.deepEqual(BigInt(newSenderBalance), BigInt(senderBalance));
    });

    it('should not refund before refundTimeInBlocks', async () => {
        let addressFromSecret = '0xc05955ecdc22E027f2094Fe8F8266B5a88270d56';
        let participant = accounts[1];
        let sender = accounts[0];
        let value = 500;

        let latestBlock = await web3.eth.getBlock("latest")
        let refundTimeInBlocks = latestBlock.number + 10;

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        try
        {
            await contractSwap.refund(addressFromSecret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimeInBlocks has not come') >= 0);
        }
    });

    it('should not refund twice', async () => {
        let addressFromSecret = '0xc05955ecdc22E027f2094Fe8F8266B5a88270d56';
        let participant = accounts[1];
        let sender = accounts[0];
        let value = 500;
        let latestBlock = await web3.eth.getBlock("latest")
        let refundTimeInBlocks = latestBlock.number + 3;

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});
        await contractSwap.refund(addressFromSecret, {from: sender, value: 0});

        // check balance and contract state
        let contractBalance = await contractToken.balanceOf(contractSwap.address);
        let swapDetails = await contractSwap.getSwapDetails(addressFromSecret);

        assert.equal(swapDetails.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swapDetails.participant, '0x0000000000000000000000000000000000000000');
        assert.deepEqual(BigInt(swapDetails.value), BigInt(0));
        assert.deepEqual(BigInt(swapDetails.refundTimeInBlocks), BigInt(0));
        assert.equal(contractBalance, 0);

        try {
            await contractSwap.refund(addressFromSecret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid msg.sender') >= 0);
        }
    });

    it('should not refund with wrong msg.sender', async () => {
        let addressFromSecret = '0xc05955ecdc22E027f2094Fe8F8266B5a88270d56';
        let participant = accounts[1];
        let sender = accounts[0];
        let value = 500;
        let latestBlock = await web3.eth.getBlock("latest")
        let refundTimeInBlocks = latestBlock.number + 3;

        await contractToken.approve(contractSwap.address, value);
        await contractSwap.initiate(refundTimeInBlocks, addressFromSecret, participant, contractToken.address, value, {from: sender, value: 0});

        try
        {
            await contractSwap.refund(addressFromSecret, {from: participant, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid msg.sender') >= 0);
        }
    });
});
