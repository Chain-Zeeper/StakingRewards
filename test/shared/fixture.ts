import { ethers } from "hardhat";
import { time, loadFixture} from "@nomicfoundation/hardhat-network-helpers";


export const StakingRewardsFixture = async()=>{
    console.log("yo")
    const [MasterAdmin,RewardSupplier,feeCollector,DepositFundAddress,User1] = await ethers.getSigners()
    
    const Factory = await ethers.getContractFactory("StakingRewards")
    const StakingRewards = await Factory.deploy(MasterAdmin,feeCollector)
    const FactoryT = await ethers.getContractFactory("TERC20")
    const STK = await FactoryT.deploy("STK","STK")
    const RWD = await FactoryT.deploy("RWD","RWD")
    console.log("yo")
    return {MasterAdmin,RewardSupplier,StakingRewards,STK,RWD,feeCollector}
}


export const LockedStakingRewardsFixture = async()=>{
    console.log("yo")
    const [MasterAdmin,RewardSupplier,feeCollector,DepositFundAddress,User1] = await ethers.getSigners()
    
    const Factory = await ethers.getContractFactory("LockedStaking")
    const LockedStaking = await Factory.deploy(MasterAdmin,feeCollector)
    const FactoryT = await ethers.getContractFactory("TERC20")
    const STK = await FactoryT.deploy("STK","STK")
    const RWD = await FactoryT.deploy("RWD","RWD")
    console.log("yo")
    return {MasterAdmin,RewardSupplier,LockedStaking,STK,RWD,feeCollector}
}

export const TokensFixture = async()=>{
    const [Owner] = await ethers.getSigners()
    const Factory = await ethers.getContractFactory("TERC20")
    const USDT =await Factory.deploy("USDT","USDT")
    const BUSD =await Factory.deploy("BUSD","BUSD")
    const USDC =await Factory.deploy("USDC","USDC")

    return {USDT,BUSD,USDC}
}