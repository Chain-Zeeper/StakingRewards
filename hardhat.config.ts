import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter"

import "hardhat-contract-sizer";
const config: HardhatUserConfig = {
  solidity: "0.8.20",
  contractSizer:{
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict:true,
    only: [":StakingRewards$",":LockedStaking$"],
  },
};

export default config;
