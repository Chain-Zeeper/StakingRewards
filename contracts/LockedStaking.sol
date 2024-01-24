// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./StakingRewards.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
error durationNotOver();
contract LockedStaking is StakingRewards{
    using SafeERC20 for IERC20;


    constructor (address defaultAdmin,address _feeCollector) StakingRewards(defaultAdmin,_feeCollector){
        
    }

    function withdraw(string memory id, uint256 _amount) public virtual override  poolExist(id) updateReward(id,msg.sender) nonReentrant()  {
        StakingProfile storage p = pools[id];
        if(balanceOf[id][msg.sender] < _amount){
            revert insufficientStaked();
        }
        if(block.timestamp < p.finishAt){
            revert durationNotOver(); 
        }
        if(_amount <0){
            revert amountZero();
        }
        p.totalSupply-=_amount;
        balanceOf[id][msg.sender] -= _amount;
        IERC20(p.stakingToken).safeTransfer(msg.sender, _amount);
    }    
    function getReward(string memory id) public virtual override poolExist(id) updateReward(id, msg.sender) nonReentrant() {
        uint256 reward = rewards[id][msg.sender];
        StakingProfile storage p = pools[id];
        if(block.timestamp < p.finishAt){
            revert durationNotOver(); 
        }
        if(reward >0){
            rewards[id][msg.sender] = 0;
            if(p.unstakeFee >0 && feeCollector != address(0)){
                uint256 fee = (reward * p.unstakeFee) /( 100 * 1e18);
                IERC20(p.rewardToken).safeTransfer(feeCollector, fee);
                reward = reward-fee;
            }
            IERC20(p.rewardToken).safeTransfer(msg.sender, reward);
            p.poolRewardBalance-=reward;
        }
    }
}