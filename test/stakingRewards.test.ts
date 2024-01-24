import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { StakingRewardsFixture } from "./shared/fixture";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { StakingRewards, TERC20 } from "../typechain-types";
import { utils } from "../typechain-types/@openzeppelin/contracts";


describe("Deployment", async function () {
  it("owner is set", async () => {
    const fixture = await loadFixture(StakingRewardsFixture)
    const DEFAULT_ADMIN = await fixture.StakingRewards.DEFAULT_ADMIN_ROLE()
    const CREATE_POOL = await fixture.StakingRewards.CREATE_POOL()
    expect(await fixture.StakingRewards.hasRole(DEFAULT_ADMIN, fixture.MasterAdmin)).to.be.true
    expect(await fixture.StakingRewards.hasRole(CREATE_POOL, fixture.MasterAdmin)).to.be.true
  })
});
describe("createPools", async () => {

  it("only pool creator can create", async () => {
    const fixture = await loadFixture(StakingRewardsFixture)
    const STKadd = await fixture.STK.getAddress()
    const RWDadd = await fixture.RWD.getAddress()
    const unstakeFee = ethers.parseUnits("10");
    const duration = 100
    await expect(fixture.StakingRewards.connect(fixture.RewardSupplier).createPool(
      "pool",
      STKadd,
      RWDadd,
      duration,
      unstakeFee,
      fixture.RewardSupplier
    )).to.be.reverted
  })
  it("pool gets created accurately", async () => {
    const fixture = await loadFixture(StakingRewardsFixture)
    const STKadd = await fixture.STK.getAddress()
    const RWDadd = await fixture.RWD.getAddress()
    const open = await time.latest() + 1000
    const duration = 100
    const unstakeFee = ethers.parseUnits("10");
    await expect(fixture.StakingRewards.createPool(
      "pool",
      STKadd,
      RWDadd,
      duration,
      unstakeFee,
      fixture.RewardSupplier
    )).to.emit(fixture.StakingRewards, "poolCreated")

    const pool = await fixture.StakingRewards.pools("pool")
    //  ### pool details ##
    expect(pool.stakingToken).to.be.eq(STKadd)
    expect(pool.rewardToken).to.be.eq(RWDadd)
    expect(pool.duration).to.be.eq(100)
    expect(pool.finishAt).to.be.eq(0)
    expect(pool.updatedAt).to.be.eq(0)
    expect(pool.rewardPerTokenStored).to.be.eq(0)
    expect(pool.rewardRate).to.be.eq(0)
    expect(pool.totalSupply).to.be.eq(0)
    expect(pool.poolRewardBalance).to.be.eq(0)
    expect(pool.rewardSupplier).to.be.eq(fixture.RewardSupplier.address)

  })
  it("no override pools", async () => {
    const fixture = await loadFixture(StakingRewardsFixture)
    const STKadd = await fixture.STK.getAddress()
    const RWDadd = await fixture.RWD.getAddress()
    const duration = 100
    const unstakeFee = ethers.parseUnits("10");
    await expect(fixture.StakingRewards.createPool(
      "pool",
      STKadd,
      RWDadd,
      duration,
      unstakeFee,
      fixture.RewardSupplier
    )).to.emit(fixture.StakingRewards, "poolCreated")
    await expect(fixture.StakingRewards.createPool(
      "pool",
      STKadd,
      RWDadd,
      duration,
      unstakeFee,
      fixture.RewardSupplier
    )).to.be.revertedWithCustomError(fixture.StakingRewards, "poolAlreadyExist")
  })
})

describe("notify Reward", async () => {
  let fixture: { STK: TERC20; RWD: TERC20; StakingRewards: StakingRewards; RewardSupplier: HardhatEthersSigner; MasterAdmin: HardhatEthersSigner; }
  beforeEach(async () => {
    fixture = await loadFixture(StakingRewardsFixture)
    await fixture.RWD.mint(fixture.RewardSupplier.address, ethers.parseUnits("2000"))
    await fixture.RWD.connect(fixture.RewardSupplier).approve(
      await fixture.StakingRewards.getAddress(), ethers.MaxUint256)

    const STKadd = await fixture.STK.getAddress()
    const RWDadd = await fixture.RWD.getAddress()
    const duration = 100
    const unstakeFee = ethers.parseUnits("10");
    await expect(fixture.StakingRewards.createPool(
      "pool",
      STKadd,
      RWDadd,
      duration,
      unstakeFee,
      fixture.RewardSupplier
    )).to.emit(fixture.StakingRewards, "poolCreated")
  })

  it("only rewardSupplier", async () => {
    await expect(
      fixture.StakingRewards.notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.revertedWithCustomError(fixture.StakingRewards, "notRewardSupplier")
  })
  it("only pool exist", async () => {
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok
  })
  it("reward values get updated properly", async () => {
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok
    const now = await time.latest()
    const pool = await fixture.StakingRewards.pools("pool")
    expect(pool.rewardRate).to.be.eq(ethers.parseUnits("1000") / pool.duration)
    expect(pool.finishAt).to.be.eq(now + Number(pool.duration))
    expect(pool.updatedAt).to.be.eq(now)
    expect(pool.rewardPerTokenStored).to.be.eq(0)
    expect(pool.totalSupply).to.be.eq(0)
    expect(pool.poolRewardBalance).to.be.eq(ethers.parseUnits("1000"))
  })
  it("reward notification in betweeen duration", async () => {
    await fixture.STK.mint(fixture.MasterAdmin.address, ethers.parseUnits("100"))
    await fixture.STK.approve(await fixture.StakingRewards.getAddress(), ethers.parseUnits("100"))
    await fixture.StakingRewards.stake("pool", ethers.parseUnits("50"))
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok
    // some stakes and unstakes
    let pool = await fixture.StakingRewards.pools("pool")
    await time.increaseTo(Number(pool.finishAt) - 50)
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok
    const poolnew = await fixture.StakingRewards.pools("pool")
    //  ### pool details ##
    expect(poolnew.finishAt).to.be.greaterThan(pool.finishAt)
    expect(poolnew.updatedAt).to.be.greaterThan(pool.updatedAt)
    expect(poolnew.rewardPerTokenStored).to.be.greaterThan(0)
    expect(poolnew.totalSupply).to.be.eq(ethers.parseUnits("50"))
    expect(poolnew.poolRewardBalance).to.be.eq(ethers.parseUnits("2000"))
  })
  it("reward notification after duration", async () => {
    await fixture.STK.mint(fixture.MasterAdmin.address, ethers.parseUnits("100"))
    await fixture.STK.approve(await fixture.StakingRewards.getAddress(), ethers.parseUnits("100"))
    await fixture.StakingRewards.stake("pool", ethers.parseUnits("50"))
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok
    // some stakes and unstakes
    let pool = await fixture.StakingRewards.pools("pool")
    await time.increaseTo(pool.finishAt)
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok
    const poolnew = await fixture.StakingRewards.pools("pool")
    expect(poolnew.finishAt).to.be.greaterThan(pool.finishAt)
    expect(poolnew.updatedAt).to.be.greaterThan(pool.updatedAt)
    expect(poolnew.rewardPerTokenStored).to.be.greaterThan(0)
    expect(poolnew.totalSupply).to.be.eq(ethers.parseUnits("50"))
    expect(poolnew.poolRewardBalance).to.be.eq(ethers.parseUnits("2000"))
  })

})


describe("stake", async () => {
  let fixture: { STK: TERC20; RWD: TERC20; StakingRewards: StakingRewards; RewardSupplier: HardhatEthersSigner; MasterAdmin: HardhatEthersSigner; }
  beforeEach(async () => {
    fixture = await loadFixture(StakingRewardsFixture)
    await fixture.RWD.mint(fixture.RewardSupplier.address, ethers.parseUnits("2000"))
    await fixture.RWD.connect(fixture.RewardSupplier).approve(
      await fixture.StakingRewards.getAddress(), ethers.MaxUint256)

    const STKadd = await fixture.STK.getAddress()
    const RWDadd = await fixture.RWD.getAddress()
    const duration = 100
    const unstakeFee = ethers.parseUnits("10");
    await expect(fixture.StakingRewards.createPool(
      "pool",
      STKadd,
      RWDadd,
      duration,
      unstakeFee,
      fixture.RewardSupplier
    )).to.emit(fixture.StakingRewards, "poolCreated")
  })
  it("pool exist", async () => {
    await expect(fixture.StakingRewards.stake("po", ethers.parseUnits("50"))).to.be.revertedWithCustomError(
      fixture.StakingRewards, "noPool"
    )
  })
  it("values updated accurately", async () => {
    await fixture.STK.mint(fixture.MasterAdmin.address, ethers.parseUnits("100"))
    await fixture.STK.approve(await fixture.StakingRewards.getAddress(), ethers.parseUnits("100"))
    await fixture.StakingRewards.stake("pool", ethers.parseUnits("50"))
    const pool = await fixture.StakingRewards.pools("pool")
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok


    await time.increase(10)
    expect(await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)).to.be.greaterThan(100)
    const poolNew = await fixture.StakingRewards.pools("pool")


    expect(poolNew.updatedAt).to.be.greaterThan(pool.updatedAt)
    expect(poolNew.rewardPerTokenStored).to.be.eq(0)
    expect(poolNew.rewardRate).to.be.eq(ethers.parseUnits("1000") / pool.duration)
    expect(poolNew.totalSupply).to.be.eq(ethers.parseUnits("50"))
    expect(poolNew.poolRewardBalance).to.be.eq(ethers.parseUnits("1000"))
    expect(poolNew.rewardSupplier).to.be.eq(fixture.RewardSupplier.address)


  })

})
describe("unstake", async () => {
  let fixture: { STK: TERC20; RWD: TERC20; StakingRewards: StakingRewards; RewardSupplier: HardhatEthersSigner; MasterAdmin: HardhatEthersSigner; }
  beforeEach(async () => {
    fixture = await loadFixture(StakingRewardsFixture)
    await fixture.RWD.mint(fixture.RewardSupplier.address, ethers.parseUnits("2000"))
    await fixture.RWD.connect(fixture.RewardSupplier).approve(
      await fixture.StakingRewards.getAddress(), ethers.MaxUint256)
      const unstakeFee = ethers.parseUnits("10");
    const STKadd = await fixture.STK.getAddress()
    const RWDadd = await fixture.RWD.getAddress()
    const duration = 100
    await expect(fixture.StakingRewards.createPool(
      "pool",
      STKadd,
      RWDadd,
      duration,
      unstakeFee,
      fixture.RewardSupplier
    )).to.emit(fixture.StakingRewards, "poolCreated")
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok
    await fixture.STK.mint(fixture.MasterAdmin.address, ethers.parseUnits("100"))
    await fixture.STK.approve(await fixture.StakingRewards.getAddress(), ethers.parseUnits("100"))
    await fixture.StakingRewards.stake("pool", ethers.parseUnits("50"))
  })
  it("pool exist", async () => {
    await expect(
      fixture.StakingRewards.withdraw("po", ethers.parseUnits("100")))
      .to.be.revertedWithCustomError(fixture.StakingRewards, "noPool")
  })
  it("unstake not more than balacne", async () => {
    await expect(fixture.StakingRewards.withdraw("pool", ethers.parseUnits("100")))
      .to.be.revertedWithCustomError(fixture.StakingRewards, "insufficientStaked")
  })
  it("unstake after duraton", async () => {

    const pool = await fixture.StakingRewards.pools("pool");
    await time.increaseTo(Number(pool.finishAt) + 100)
    const balance = await fixture.STK.balanceOf(fixture.MasterAdmin.address)
    expect(await fixture.StakingRewards.withdraw("pool", ethers.parseUnits("10")))
      .to.be.ok
    const balanceNew = await fixture.STK.balanceOf(fixture.MasterAdmin.address)
    expect(balanceNew).to.eq(balance + ethers.parseUnits("10"))

  })
  it("unstake in between Duration", async () => {
    await time.increase(10)
    const balance = await fixture.STK.balanceOf(fixture.MasterAdmin.address)
    expect(await fixture.StakingRewards.withdraw("pool", ethers.parseUnits("10")))
      .to.be.ok
    const balanceNew = await fixture.STK.balanceOf(fixture.MasterAdmin.address)
    expect(balanceNew).to.eq(balance + ethers.parseUnits("10"))

  })
  it("stop Earning Rewards", async () => {
    const pool = await fixture.StakingRewards.pools("pool");
    const earned = await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)

    await time.increase(10)
    const earned1 = await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)
    expect(earned1 > earned)

    await time.increaseTo(Number(pool.finishAt) + 10)
    const earned2 = await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)
    await time.increase(100)

    const earned3 = await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)
    expect(earned2 == earned3)
  })
})


describe("getRewards", async () => {
  let fixture: { STK: TERC20; RWD: TERC20; StakingRewards: StakingRewards; RewardSupplier: HardhatEthersSigner; MasterAdmin: HardhatEthersSigner; feeCollector:HardhatEthersSigner }
  beforeEach(async () => {
    const unstakeFee = ethers.parseUnits("10");
    fixture = await loadFixture(StakingRewardsFixture)
    await fixture.RWD.mint(fixture.RewardSupplier.address, ethers.parseUnits("2000"))
    await fixture.RWD.connect(fixture.RewardSupplier).approve(
      await fixture.StakingRewards.getAddress(), ethers.MaxUint256)

    const STKadd = await fixture.STK.getAddress()
    const RWDadd = await fixture.RWD.getAddress()
    const duration = 100
    await expect(fixture.StakingRewards.createPool(
      "pool",
      STKadd,
      RWDadd,
      duration,
      unstakeFee,
      fixture.RewardSupplier
    )).to.emit(fixture.StakingRewards, "poolCreated")
    expect(await
      fixture.StakingRewards.connect(fixture.RewardSupplier).notifyRewardAmount("pool", ethers.parseUnits("1000")))
      .to.be.ok
    await fixture.STK.mint(fixture.MasterAdmin.address, ethers.parseUnits("100"))
    await fixture.STK.approve(await fixture.StakingRewards.getAddress(), ethers.parseUnits("100"))
    await fixture.StakingRewards.stake("pool", ethers.parseUnits("50"))
  })
  it("pool exist", async () => {
    await expect(fixture.StakingRewards.getReward("pol")).to.be.revertedWithCustomError(fixture.StakingRewards, "noPool")
  })
  it("pool no reward Earned no revert", async () => {
    const earned = await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)
    const balance = await fixture.RWD.balanceOf(fixture.MasterAdmin.address)
    expect(await fixture.StakingRewards.getReward("pool")).to.be.ok
    const balance2 = await fixture.RWD.balanceOf(fixture.MasterAdmin.address)

    expect(balance == balance2)
  })
  it("get after duraton", async () => {
    const pool = await fixture.StakingRewards.pools("pool");
    await time.increaseTo(Number(pool.finishAt) + 100)
    const balance = await fixture.RWD.balanceOf(fixture.MasterAdmin.address)
    const earned = await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)
    const fee = earned * BigInt(10)/ BigInt(100)
    expect(await fixture.StakingRewards.getReward("pool")).to.be.ok
    const balance2 = await fixture.RWD.balanceOf(fixture.MasterAdmin.address)
    expect (balance2).to.eq(balance + earned -fee)
    const balance3 = await fixture.RWD.balanceOf(fixture.feeCollector.address)
    expect (balance3).to.eq(fee)
  })
  it("getReward in between Duration", async() => {
    await time.increase(10)
    const balance = await fixture.RWD.balanceOf(fixture.MasterAdmin.address)
    const earned = await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)
    expect(await fixture.StakingRewards.getReward("pool")).to.be.ok
    const balance2 = await fixture.RWD.balanceOf(fixture.MasterAdmin.address)
    expect (balance2).to.greaterThan(balance)

    const earned2 = await fixture.StakingRewards.earned("pool", fixture.MasterAdmin.address)
  })
})


// describe("fuzz test",async()=>{

//   it("")
// })