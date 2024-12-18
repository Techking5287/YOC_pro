import React, { FC, useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { mathExact } from 'math-exact';
import { Contract, constants } from 'ethers';
const { MaxUint256 } = constants;
import _ from "lodash";

import Modal from '@components/widgets/Modalv2';
import SideMenuBar from '@components/widgets/SideMenuBar';
import SimpleLoading from '@components/widgets/SimpleLoading';
import TokenComponent from '@components/widgets/TokenComponent';

import { TOKENS, tokenInterface } from '../src/constants/tokens';
import { TokenTemplate, YOCSwapRouter, WETH } from "../src/constants/contracts";
import { alert_show, loading_end, loading_start } from "../store/actions";
import { convertEthToWei, convertWeiToEth } from "../utils/unit";
import { debounceHook } from '../utils/hook';
import axios from 'axios';
import useWallet from '@hooks/useWallet';
import useAccount from '@hooks/useAccount';
import ProgressInput from '@components/widgets/ProgressInput';
import TokenSelector from '@components/widgets/TokenSelector';

const tempMaxValue = 99999999999;
const ethAddress = WETH;
const txRunLimitTime = 1000 * 60 * 5; // 5 min

const Swap: FC = () => {

    const dispatch = useDispatch();
    const { provider, signer, account, ETHBalance } = useAccount();
    const { disconnectWallet } = useWallet();
    const [typeIn, setTypeIn] = useState<tokenInterface>();
    const [typeOut, setTypeOut] = useState<tokenInterface>();
    const [amountIn, setAmountIn] = useState(0);
    const [amountOut, setAmountOut] = useState(0);
    const [myBalanceIn, setMyBalanceIn] = useState(0);
    const [myBalanceOut, setMyBalanceOut] = useState(0);
    const [allowanceIn, setAllowanceIn] = useState(0);
    const [allowanceOut, setAllowanceOut] = useState(0);
    const [pendingSwap, setPendingSwap] = useState(false);
    const [pendingApproveIn, setPendingApproveIn] = useState(false);
    const [pendingApproveOut, setPendingApproveOut] = useState(false);
    const [rate, setRate] = useState(0);
    const [lastTarget, setLastTarget] = useState('in');
    const swapContract = useMemo(() => {
        return new Contract(
            YOCSwapRouter.address,
            YOCSwapRouter.abi,
            provider
        )
    }, [provider]);
    const [swapStep, setSwapStep] = useState('swap');
    const [priceImpact, setPriceImpact] = useState(0);
    const [percentageAmountIn, setPercentageAmountIn] = useState(0);
    const [showWaitingModal, setShowWaitingModal] = useState(false);

    useEffect(() => {
        if (provider && account) {
            // setTypeInHandle(TOKENS[0])
        }
    }, [provider, account])

    useEffect(() => {
        if (swapContract) {
            (async () => {
                // const WETH = await swapContract.getWETH();
                // setEthAddress(WETH);
            })();
        }
    }, [swapContract])

    const calculateRate = async (in_: tokenInterface, out_: tokenInterface, amount: number, direct: boolean) => {
        if (!(in_ && out_ && ethAddress) || in_.address == out_.address || !amount) return 0;
        dispatch(loading_start() as any);
        setRate(0);
        try {
            let tmpRate = 0;
            if (direct) {
                let res = await swapContract.getAmountsOut(
                    convertEthToWei(Number(amount).toFixed(in_.decimals), in_.decimals),
                    [
                        in_.address,
                        out_.address
                    ]
                );
                const res0 = convertWeiToEth(res[0], in_.decimals);
                const res1 = convertWeiToEth(res[1], out_.decimals);
                setRate(+res0 / +res1);
                tmpRate = +res0 / +res1;
                setAmountOut(+res1);

                let priceimpactResponse = await axios.get(process.env.API_ADDRESS + `/liquidity/priceimpact`, {
                    params: {
                        token0: in_.address,
                        token1: out_.address,
                        amountIn: amount,
                        amountOut: +res1
                    }
                });
                if (priceimpactResponse.data) {
                    setPriceImpact(priceimpactResponse.data.priceImpact);
                }
            } else {
                let res = await swapContract.getAmountsIn(
                    convertEthToWei(Number(amount).toFixed(out_.decimals), out_.decimals),
                    [
                        in_.address,
                        out_.address
                    ]
                );
                const res0 = convertWeiToEth(res[0], in_.decimals);
                const res1 = convertWeiToEth(res[1], out_.decimals);
                console.log(res0, res1);
                setRate(+res1 / +res0);
                tmpRate = +res1 / +res0;
                setAmountIn(+res0);

                let priceimpactResponse = await axios.get(process.env.API_ADDRESS + `/liquidity/priceimpact`, {
                    params: {
                        token0: in_.address,
                        token1: out_.address,
                        amountIn: +res0,
                        amountOut: amount
                    }
                });
                if (priceimpactResponse.data) {
                    setPriceImpact(priceimpactResponse.data.priceImpact);
                }
            }
            dispatch(loading_end() as any);
        } catch (err) {
            setRate(0);
            console.dir(err);
            dispatch(loading_end() as any);
        }
    }

    const checkAllowance = async (token: tokenInterface) => {
        if (!token) return false;
        let tokenContract = new Contract(
            token.address,
            TokenTemplate.abi,
            provider
        );
        let approveAmount = convertWeiToEth((await tokenContract.allowance(account, YOCSwapRouter.address)), token.decimals);
        return approveAmount;
    }

    const setAmountInHandle = async (v: number) => {
        setAmountIn(v);
        if (myBalanceIn) {
            setPercentageAmountIn(amountIn * 100 / myBalanceIn)
        }
        setLastTarget('in');

        debounceHook(() => {
            calculateRate(typeIn as tokenInterface, typeOut as tokenInterface, v, true);
        })
    }

    const setAmountOutHandle = (v: number) => {
        setAmountOut(v)
        setLastTarget('out');

        debounceHook(() => {
            calculateRate(typeIn as tokenInterface, typeOut as tokenInterface, v, false);
        })
    }

    const setTypeInHandle = async (v: tokenInterface) => {
        try {
            setAllowanceIn(tempMaxValue);
            setLastTarget('in');
            setTypeIn(v);
            await calculateRate(v, typeOut as tokenInterface, amountIn, true);
            if (v.address == WETH) {
                setMyBalanceIn(ETHBalance);
            } else {
                const contract = new Contract(
                    v.address,
                    TokenTemplate.abi,
                    provider
                );

                let balance = await contract.balanceOf(account);
                setMyBalanceIn(+convertWeiToEth(balance, v.decimals));

                let allowAmount = await checkAllowance(v);
                setAllowanceIn(Number(allowAmount));
            }
        } catch (error) {
            console.dir(error);
        }
    }

    const setTypeOutHandle = async (v: tokenInterface) => {
        try {
            setLastTarget('out');
            setAllowanceOut(tempMaxValue);
            setTypeOut(v);
            await calculateRate(typeIn as tokenInterface, v, amountOut, false);
            if (v.address == WETH) {
                setMyBalanceOut(ETHBalance);
            } else {
                const contract = new Contract(
                    v.address,
                    TokenTemplate.abi,
                    provider
                );
                let balance = await contract.balanceOf(account);
                setMyBalanceOut(+convertWeiToEth(balance, v.decimals));

                let allowAmount = await checkAllowance(v);
                setAllowanceOut(Number(allowAmount));
            }
        } catch (error) {
            console.dir(error);
        }
    }

    const approveHandle = async (token: tokenInterface, type: string) => {
        let tokenContract = new Contract(
            token.address,
            TokenTemplate.abi,
            signer
        );

        try {
            let amount = 0;
            if (type == "in") {
                setPendingApproveIn(true);
                amount = tempMaxValue;
            } else {
                setPendingApproveOut(true);
                amount = tempMaxValue;
            }
            let tx = await tokenContract.approve(YOCSwapRouter.address, MaxUint256, {
                gasLimit: 300000
            });
            const receipt = await tx.wait();
            console.log(receipt.events)
            if (type == "in") {
                setPendingApproveIn(false);
                setAllowanceIn(amount);
            } else {
                setPendingApproveOut(false);
                setAllowanceOut(amount);
            }
        } catch (err) {
            if (type == "in") {
                setPendingApproveIn(false);
            } else {
                setPendingApproveOut(false);
            }
        }
    }

    const swapHandle = async () => {
        try {
            if (typeIn && typeOut) {
                setPendingSwap(true);
                setShowWaitingModal(true);
                let tokenContract = new Contract(
                    YOCSwapRouter.address,
                    YOCSwapRouter.abi,
                    signer
                );
                let tx;
                if (typeIn.address == WETH) {
                    if (lastTarget == 'in') {
                        tx = await tokenContract.swapExactETHForTokens(
                            '0', // convertEthToWei(String(Number(+amountOut).toFixed(typeOut.decimals)), typeOut.decimals),
                            [ethAddress, typeOut.address],
                            account,
                            Date.now() + txRunLimitTime + '',
                            {
                                value: convertEthToWei(String(Number(+amountIn).toFixed(+typeIn.decimals)), typeIn.decimals),
                                gasLimit: 300000
                            }
                        );
                    } else {
                        tx = await tokenContract.swapETHForExactTokens(
                            convertEthToWei(String(Number(+amountOut).toFixed(+typeOut.decimals)), typeOut.decimals),
                            [ethAddress, typeOut.address],
                            account,
                            Date.now() + txRunLimitTime + '',
                            {
                                value: convertEthToWei(String(Number(+amountIn).toFixed(typeIn.decimals)), typeIn.decimals),
                                gasLimit: 300000
                            }
                        );
                    }
                } else if (typeOut.address == WETH) {
                    if (allowanceIn < amountIn) {
                        await approveHandle(typeIn, 'in')
                    }
                    if (lastTarget == 'in') {
                        tx = await tokenContract.swapExactTokensForETH(
                            convertEthToWei(String(Number(+amountIn).toFixed(+typeIn.decimals)), typeIn.decimals),
                            '0', //convertEthToWei(String(Number(+amountOut).toFixed(typeOut.decimals)), typeOut.decimals), // 0
                            [typeIn.address, ethAddress],
                            account,
                            Date.now() + txRunLimitTime + '',
                            {
                                gasLimit: 300000
                            }
                        );
                    } else {
                        tx = await tokenContract.swapTokensForExactETH(
                            convertEthToWei(String(Number(+amountOut).toFixed(+typeOut.decimals)), typeOut.decimals),
                            '0', // convertEthToWei(String(Number(+amountIn).toFixed(typeIn.decimals)), typeIn.decimals),
                            [typeIn.address, ethAddress],
                            account,
                            Date.now() + txRunLimitTime + '',
                            {
                                gasLimit: 300000
                            }
                        );
                    }
                } else {
                    if (allowanceIn < amountIn) {
                        await approveHandle(typeIn, 'in')
                    }

                    if (lastTarget == 'in') {
                        tx = await tokenContract.swapExactTokensForTokens(
                            convertEthToWei(String(Number(+amountIn).toFixed(+typeIn.decimals)), typeIn.decimals),
                            '0', // convertEthToWei(String(Number(+amountOut).toFixed(typeOut.decimals)), typeOut.decimals), // 0
                            [typeIn.address, typeOut.address],
                            account,
                            Date.now() + txRunLimitTime + '',
                            {
                                gasLimit: 300000
                            }
                        );
                    } else {
                        tx = await tokenContract.swapTokensForExactTokens(
                            convertEthToWei(String(Number(+amountOut).toFixed(+typeOut.decimals)), typeOut.decimals),
                            '0', // convertEthToWei(String(Number(+amountIn).toFixed(typeIn.decimals)), typeIn.decimals), // 0
                            [typeIn.address, typeOut.address],
                            account,
                            Date.now() + txRunLimitTime + '',
                            {
                                gasLimit: 300000
                            }
                        );
                    }
                }
                const receipt = await tx.wait();
                setMyBalanceIn(+mathExact('Subtract', +myBalanceIn, +amountIn));
                setMyBalanceOut(+mathExact('Add', +myBalanceOut, +amountOut));
                setPendingSwap(false);
                setShowWaitingModal(false);
                setSwapStep('swap');
                dispatch(alert_show({ content: 'Swaped Successfully!', status: 'success' }) as any);
            }
        } catch (error: any) {
            console.dir(error);
            if (error.code == "UNPREDICTABLE_GAS_LIMIT") dispatch(alert_show({ content: 'Insufficient B amount', status: 'error' }) as any);
            else if (error.code == "4001") dispatch(alert_show({ content: 'You rejected the operation', status: 'error' }) as any);
            setPendingSwap(false);
            setShowWaitingModal(false);
        }
    }

    const changeTokenEach = async () => {
        const tempType = typeIn;
        setTypeIn(typeOut as tokenInterface);
        setTypeOut(tempType as tokenInterface);

        const tempBalance = myBalanceIn;
        setMyBalanceIn(myBalanceOut);
        setMyBalanceOut(tempBalance);

        const tempAllowance = allowanceIn;
        setAllowanceIn(allowanceOut);
        setAllowanceOut(tempAllowance);

        const tempPendingApprove = pendingApproveIn;
        setPendingApproveOut(tempPendingApprove);

        await calculateRate(typeOut as tokenInterface, typeIn as tokenInterface, amountOut, true);
        setAmountIn(amountOut);

        setLastTarget(lastTarget == 'in' ? 'out' : "in");
    }

    const confirmSwapHandle = () => {
        setSwapStep('confirm');
    }

    const customAmountSetHandle = (type: string, per: number = 100) => {
        if (type == 'in') {
            setAmountInHandle(mathExact('Multiply', +myBalanceIn, per / 100));
        } else {
            setAmountOutHandle(mathExact('Multiply', +myBalanceOut, per / 100));
        }
    }

    return (
        <div className='relative w-full'>
            <div className='container !py-0 mx-auto min-h-[450px]'>
                <div className='swap-container relative min-w-full min-h-full'>
                    <div className='absolute left-0 top-0 w-full h-full -z-10'>
                        <div className='absolute right-0 -top-[250px] w-[350px] h-[650px] opacity-25 bg-tr-gradient bg-blend-color-dodge'></div>
                    </div>
                    <div className='w-full h-full z-20 p-8'>
                        <div className=' mx-auto flex flex-col bg-bg-pattern shadow-big w-[400px]'>
                            {
                                // swapStep == "swap" ? (
                                <>
                                    <div className='px-3 py-6'>
                                        <h3 className='relative text-2xl font-semibold text-primary text-center'>
                                            Swap
                                            <div className='absolute right-0 top-0'>
                                                <img className='h-[35px]' src='/images/swap-header.png' alt='swap' />
                                            </div>
                                        </h3>
                                        <p className='text-dark-secondary mt-4 text-center'>Trade tokens in an instant</p>
                                    </div>

                                    <div className='relative px-3 py-6 bg-primary-pattern border border-[#ffffff28] rounded -mx-[1px]'>
                                        <div className='flex flex-col justify-between relative mt-2'>
                                            <TokenSelector side="right"
                                                type={typeIn}
                                                setType={(v) => setTypeInHandle(v)}
                                                amount={amountIn}
                                                setAmount={(v) => setAmountInHandle(v)}
                                                ignoreValue={typeOut}
                                                disabled={!Boolean(account)}
                                                balance={myBalanceIn}
                                                loading={pendingApproveIn}
                                            />
                                        </div>
                                        <div>
                                            {/* <p className='text-sm italic'>25%</p>
                                            <p className='text-sm italic'>50%</p>
                                            <p className='text-sm italic'>75%</p> */}
                                        </div>
                                        {/* <div className='flex items-center justify-between py-3'>
                                            <ProgressInput className='w-full' inputClassName='plus !bg-gray-400' value={percentageAmountIn} setValue={(v) => { setPercentageAmountIn(v); customAmountSetHandle('in', v) }} />
                                            <button className='bg-status-plus px-3 py-2 text-sm rounded shadow-btn-primary ml-2' onClick={() => { setPercentageAmountIn(100); customAmountSetHandle('in', 100) }}>Max</button>
                                        </div> */}
                                        <div className='flex items-center justify-between py-3'>
                                            <ProgressInput
                                                className='w-full'
                                                inputClassName='plus !bg-gray-400'
                                                value={percentageAmountIn}
                                                setValue={(v) => { setPercentageAmountIn(v); customAmountSetHandle('in', v) }}
                                            />
                                            <div className='flex space-x-2'>
                                                <button
                                                    className='bg-status-plus px-3 py-2 text-sm rounded shadow-btn-primary'
                                                    onClick={() => { setPercentageAmountIn(25); customAmountSetHandle('in', 25); }}
                                                >
                                                    25%
                                                </button>
                                                <button
                                                    className='bg-status-plus px-3 py-2 text-sm rounded shadow-btn-primary'
                                                    onClick={() => { setPercentageAmountIn(50); customAmountSetHandle('in', 50); }}
                                                >
                                                    50%
                                                </button>
                                                <button
                                                    className='bg-status-plus px-3 py-2 text-sm rounded shadow-btn-primary'
                                                    onClick={() => { setPercentageAmountIn(75); customAmountSetHandle('in', 75); }}
                                                >
                                                    75%
                                                </button>
                                                <button
                                                    className='bg-status-plus px-3 py-2 text-sm rounded shadow-btn-primary'
                                                    onClick={() => { setPercentageAmountIn(100); customAmountSetHandle('in', 100); }}
                                                >
                                                    Max
                                                </button>
                                            </div>
                                        </div>
                                        {/* <div className='flex items-center justify-between'>
                                                <div className='flex items-center py-2'>
                                                    <label className='text-sm mr-2'>Balance:</label>
                                                    <span className='text-sm text-[#8B8B8B]'>{myBalanceIn}</span>
                                                </div>
                                                <div className='flex items-center'>
                                                    {
                                                        pendingApproveIn ?
                                                            <SimpleLoading className="w-[20px]" />
                                                            : (
                                                                ((!allowanceIn && (typeIn && typeIn.address != WETH)) || allowanceIn < amountIn) ?
                                                                    <button className='bg-btn-primary px- w-full px-2 text-sm rounded shadow-btn-primary' onClick={() => approveHandle(typeIn as tokenInterface, 'in')}>approve</button>
                                                                    : ""
                                                            )
                                                    }
                                                </div>
                                            </div> */}
                                        <div className='absolute z-[1] left-1/2 aspect-[1/1] -bottom-[calc(20px_+_0.5rem)] -translate-x-1/2 cursor-pointer'><img src='/images/swap.png' alt="swap" width={40} height={40} onClick={() => changeTokenEach()} /></div>
                                    </div>
                                    <div className='relative -z-0 px-3 pt-6 pb-4 mt-1 bg-secondary-pattern border border-[#ffffff28] rounded -mx-[1px]'>
                                        <div className='flex flex-col justify-between relative mt-2'>
                                            <TokenSelector side="right"
                                                type={typeOut}
                                                setType={(v) => setTypeOutHandle(v)}
                                                amount={amountOut}
                                                setAmount={(v) => setAmountOutHandle(v)}
                                                ignoreValue={typeIn}
                                                disabled={!Boolean(account)}
                                                balance={myBalanceOut}
                                            />
                                        </div>

                                        <div className='flex items-center justify-end text-md mt-2 mb-1'>
                                            <span className='text-white'>Fee: </span>
                                            <span className='text-white'>0.19%</span>
                                        </div>
                                        <div className='bg-[#aaaaaa20] backdrop:blur-sm p-2.5 text-base rounded'>
                                            <div className='flex items-center justify-between mb-2'>
                                                <span>Price</span>
                                                <span>1 {typeOut?.symbol} = {rate} {typeIn?.symbol}</span>
                                            </div>
                                            <div className='flex items-center justify-between'>
                                                <span>Price Impact</span>
                                                <span>{Number(priceImpact * 100).toFixed(2)} %</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className='px-3 py-4'>
                                        {/* <p className='text-primary text-sm'>Slippage Tolerance</p>
                                            <p className='text-secondary text-sm'>{'0.5'}%</p> */}
                                        {
                                            pendingSwap ? (
                                                <button className='bg-btn-primary w-full flex items-center justify-around py-5 text-3xl rounded-lg shadow-btn-primary'><SimpleLoading className='w-[36px] h-[36px]' /></button>
                                            ) : (
                                                account ?
                                                    <button className='bg-btn-primary w-full py-5 text-3xl rounded-lg shadow-btn-primary disabled:bg-btn-disable' disabled={(!+amountIn || amountIn > myBalanceIn || !amountOut || !rate) as boolean} onClick={() => swapHandle()}>Swap</button>
                                                    :
                                                    <button className='bg-btn-primary w-full py-5 my-10 text-3xl rounded-lg shadow-btn-primary' onClick={() => disconnectWallet()}>Connect Wallet</button>
                                            )
                                        }
                                    </div>
                                </>
                                // )
                                //     : (
                                //         <>
                                //             <div className='px-3 py-6'>
                                //                 <h3 className='relative text-2xl font-semibold text-primary text-center'>
                                //                     <div className='absolute left-0 top-0 cursor-pointer' onClick={() => { setSwapStep('swap') }}>
                                //                         {/* <img className='h-[35px]' src='/images/swap-header.png' alt='swap' /> */}
                                //                         <img className='h-[35px]' src="https://img.icons8.com/color-glass/48/null/circled-left-2.png" />
                                //                     </div>
                                //                     Confirm Swap
                                //                     <div className='absolute right-0 top-0'>
                                //                         <img className='h-[35px]' src='/images/swap-header.png' alt='swap' />
                                //                     </div>
                                //                 </h3>
                                //                 <p className='text-dark-secondary mt-4 text-center'>Output is estimated</p>
                                //             </div>

                                //             <div className='relative px-3 py-6 bg-primary-pattern border border-[#ffffff28] rounded -mx-[1px]'>
                                //                 <div className='flex justify-between items-center relative mt-2 px-6 text-xl'>
                                //                     <label className='text-dark-primary'>{amountIn}</label>
                                //                     <div className='min-w-[100]'>{typeIn?.symbol}</div>
                                //                 </div>
                                //                 <div className='absolute z-[1] left-1/2 aspect-[1/1] -bottom-[calc(20px_+_0.5rem)] -translate-x-1/2 cursor-pointer'><img src='/images/swap.png' alt="swap" width={40} height={40} /></div>
                                //             </div>
                                //             <div className='relative -z-0 px-3 pt-6 pb-4 mt-1 bg-secondary-pattern border border-[#ffffff28] rounded -mx-[1px]'>
                                //                 <div className='flex justify-between items-center relative mt-2 px-6 text-xl'>
                                //                     <label className='text-dark-primary'>{amountOut}</label>
                                //                     <div className='min-w-[100]'>{typeOut?.symbol}</div>
                                //                 </div>
                                //             </div>

                                //             <div className='px-3 py-4'>
                                //                 <div className='flex flex-col w-full'>
                                //                     <div className='flex items-center justify-between my-4'>
                                //                         <span className='text-white'>Price</span>
                                //                         <span className='text-white'>{rate} {typeIn?.symbol}/{typeOut?.symbol}</span>
                                //                     </div>
                                //                     {/* <div className='flex items-center justify-between mb-4'>
                                //                         <span className='text-white'>Minumum Received</span>
                                //                         <span className='text-white'>2.237 {typeOut?.symbol}</span>
                                //                     </div> */}
                                //                     <div className='flex items-center justify-between mb-4'>
                                //                         <span className='text-white'>Price Impact</span>
                                //                         <span className='text-secondary'>{Number(priceImpact * 100).toFixed(2)} %</span>
                                //                     </div>
                                //                     <div className='flex items-center justify-between mb-4'>
                                //                         <span className='text-white'>Liquidity Provide fee</span>
                                //                         <span className='text-white'>0.19%</span>
                                //                     </div>
                                //                 </div>
                                //                 {
                                //                     pendingSwap ?
                                //                         <button className='bg-btn-primary flex justify-around items-center w-full py-5 my-10 text-3xl rounded-lg shadow-btn-primary'><SimpleLoading className='w-[36px] h-[36px]' /></button>
                                //                         :
                                //                         <button className='bg-btn-primary w-full py-5 my-10 text-3xl rounded-lg shadow-btn-primary' onClick={() => swapHandle()}>Confirm Swap</button>
                                //                 }
                                //             </div>
                                //         </>
                                //     )
                            }
                        </div>
                    </div>
                </div>
            </div>

            <Modal size='small' show={showWaitingModal} onClose={() => setShowWaitingModal(false)}>
                <div className='w-full flex flex-col justify-around items-center pt-8 px-6'>
                    <h2 className='w-full text-white text-2xl font-bold'>Waiting For Confirmation</h2>
                    <p className='text-center text-lg font-semibold w-full text-white py-4'>Swapping {amountIn} {typeIn?.symbol} for {amountOut} {typeOut?.symbol}</p>
                    <p className='text-center text-sm w-full text-white py-4'>confirm this transaction in your wallet</p>
                </div>
            </Modal>
        </div>
    )
}

export default Swap;