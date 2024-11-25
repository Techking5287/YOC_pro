// const { getProvider } = require('../untils');
// const { ethers } = require('ethers');
// const { YOC, PRIVATE_KEY, AdminWalletAddress } = require("../config/contracts");

// const MintYOCe = async () => {
//     try {
//         const provider = getProvider();

//         const handleNewBlock = async (blockNumber) => {
//             const gasPrice = await getProvider().getGasPrice();
//             const signer = new ethers.Wallet(PRIVATE_KEY, provider);
//             const YOCeContract = new ethers.Contract(YOC.address, YOC.abi, signer);
//             const amount = ethers.utils.parseUnits('650', YOC.decimals);
//             console.log(amount);
//             try {
//                 let tx = await YOCeContract.mint(AdminWalletAddress,
//                     amount,
//                     {
//                         gasLimit: 2000000,
//                         gasPrice: gasPrice
//                     }
//                 )
//                 await tx.wait();
//                 console.log(tx);
//                 console.log('New block received:', blockNumber, "\n", "<=== Minted 650 YOCe ===>");
//             } catch (err) {
//                 console.error("Mint YOCe error:", err)
//             }

//         };

//         provider.on('block', handleNewBlock);
//     } catch (err) {
//         console.error(err);
//     }
// }

// MintYOCe();


const { getProvider } = require('../untils');
const { ethers } = require('ethers');
const { YOC, PRIVATE_KEY, AdminWalletAddress } = require("../config/contracts");

let lastMintTime = 0; // Timestamp of the last minting operation
let mintQueue = [];   // Queue to store blocks for minting
let isMinting = false; // Flag to prevent concurrent minting operations

const MintYOCe = async () => {
    try {
        const provider = getProvider();

        // Function to process the minting for each block in the queue
        const processMintQueue = async () => {
            if (isMinting) {
                // Prevent concurrent minting, only process if minting is not already in progress
                return;
            }

            const currentTime = Date.now() / 1000; // Current time in seconds
            const interval = 13; // 13 seconds delay between minting

            // Check if 13 seconds have passed since the last mint
            if (currentTime - lastMintTime >= interval && mintQueue.length > 0) {
                // Mark as minting in progress
                isMinting = true;

                // Get the next block number to mint tokens for
                const blockNumber = mintQueue.shift();

                const gasPrice = await provider.getGasPrice();
                const signer = new ethers.Wallet(PRIVATE_KEY, provider);
                const YOCeContract = new ethers.Contract(YOC.address, YOC.abi, signer);
                const amount = ethers.utils.parseUnits('650', YOC.decimals); // Mint 650 YOCe (65 tokens)
                console.log(amount);

                try {
                    // Create mint transaction
                    let tx = await YOCeContract.mint(AdminWalletAddress, amount, {
                        gasLimit: 2000000,
                        gasPrice: gasPrice
                    });

                    // Wait for transaction to be mined before processing next block
                    await tx.wait();

                    // Update the last mint time
                    lastMintTime = currentTime;

                    console.log(tx);
                    console.log('Minted 65 YOCe for block', blockNumber);
                } catch (err) {
                    console.error("Mint YOCe error:", err);
                }

                // After minting, mark the minting process as complete
                isMinting = false;
                console.log("----------------->\n+13S")
            }
        };

        // Handle new blocks
        const handleNewBlock = (blockNumber) => {
            console.log('Block received:', blockNumber);

            // Add block to the mint queue
            mintQueue.push(blockNumber);

            // Process the mint queue, ensuring a delay between each mint
            processMintQueue();
        };

        provider.on('block', handleNewBlock);

    } catch (err) {
        console.error(err);
    }
};

MintYOCe();
