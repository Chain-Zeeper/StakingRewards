// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
struct StakingProfile{
    address stakingToken;
    address rewardToken;
    uint256 duration;
    uint256 finishAt;
    uint256 updatedAt;
    uint256 rewardPerTokenStored;
    uint256 rewardRate;
    uint256 totalSupply;
    uint256 poolRewardBalance;
    uint256 unstakeFee;
    address rewardSupplier;
}
error poolAlreadyExist();
error noPool();
error notRewardSupplier();
error rewardRateZero();
error rewardAmountMoreThanBalance();
error amountZero();
error insufficientStaked();
error unstakeFeeTooHigh();
contract StakingRewards is AccessControl,ReentrancyGuard{
    using SafeERC20 for IERC20;
    
    mapping(string=>StakingProfile) public pools;
    mapping(string=>mapping(address=>uint256)) public userRewardPerTokenPaid;
    mapping(string=>mapping(address=>uint256)) public rewards;
    mapping(string=>mapping(address=>uint256)) public balanceOf;
    uint256 public constant maxUnstakeFee  = 20 ether;
    address public feeCollector;

    event poolCreated(string indexed id);
    bytes32 public constant  CREATE_POOL = keccak256("CREATE_POOL");

    constructor(address defaultAdmin,address _feeCollector){
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(CREATE_POOL, defaultAdmin);
        feeCollector = _feeCollector;
    }
    function createPool(string memory id,
        address _stakingToken,
   
        address _rewardToken,
        uint256 _duration,
             uint256 _unstakeFee,
        address _rewardSupplier) external onlyRole(CREATE_POOL){
        StakingProfile memory p = pools[id];
        if(p.stakingToken != address(0)){
            revert poolAlreadyExist();
        }
        if(_unstakeFee > maxUnstakeFee){
            revert unstakeFeeTooHigh();
        }
        pools[id] = StakingProfile(
            _stakingToken,
            _rewardToken,
            _duration,
            0,
            0,0,0,0,0,
            _unstakeFee,
            _rewardSupplier
        );
        emit poolCreated(id);
        
    }

    function notifyRewardAmount(string memory id,uint256 _amount) public poolExist(id) updateReward(id,address(0)){
        StakingProfile storage p = pools[id];
        if(msg.sender != p.rewardSupplier){
            revert notRewardSupplier();
        }
        if(block.timestamp > p.finishAt){
            p.rewardRate = _amount/ p.duration;
        }
        else{
            uint remainingRewards = p.rewardRate * (p.finishAt - block.timestamp);
            p.rewardRate = (remainingRewards + _amount) / p.duration;
        }
        if(p.rewardRate == 0){
            revert rewardRateZero();
        }
        IERC20(p.rewardToken).safeTransferFrom(p.rewardSupplier, address(this), _amount);
        p.poolRewardBalance += _amount;
        if(p.rewardRate * p.duration > p.poolRewardBalance){
            revert rewardAmountMoreThanBalance();
        }
        p.updatedAt = block.timestamp;
        p.finishAt = block.timestamp + p.duration;
    }


    function stake(string memory id,uint256 _amount) public  poolExist(id) updateReward(id,msg.sender) nonReentrant()  {
        StakingProfile storage p = pools[id];
        if(_amount <0 ){
            revert amountZero();
        }
        IERC20(p.stakingToken).safeTransferFrom(msg.sender, address(this), _amount);
        p.totalSupply+=_amount;
        balanceOf[id][msg.sender] += _amount;

    }
    function withdraw(string memory id, uint256 _amount) public virtual   poolExist(id) updateReward(id,msg.sender) nonReentrant()  {
        StakingProfile storage p = pools[id];
        if(balanceOf[id][msg.sender] < _amount){
            revert insufficientStaked();
        }
        if(_amount <0){
            revert amountZero();
        }
        p.totalSupply-=_amount;
        balanceOf[id][msg.sender] -= _amount;
        IERC20(p.stakingToken).safeTransfer(msg.sender, _amount);
    }

    function rewardPerToken(string memory id) public view poolExist(id) returns(uint256) {
        StakingProfile memory p = pools[id];
        if(p.totalSupply == 0){
            return p.rewardPerTokenStored;
        }
        return p.rewardPerTokenStored + (p.rewardRate *  (lastTimeRewardApplicable(id) - p.updatedAt)  * 1e18) /p.totalSupply;
    }
    function earned(string memory id,address _account) public view poolExist(id) returns(uint256) {
        return 
        (balanceOf[id][_account] * (rewardPerToken(id)- userRewardPerTokenPaid[id][_account]))
        /1e18 + rewards[id][_account];
    }

    function lastTimeRewardApplicable(string memory id) public view returns(uint256){
        return _min(block.timestamp,pools[id].finishAt);
    }
    function _min(uint256 x,uint256 y) private pure returns(uint256){
        return x<=y ? x:y;
    }
    
    function getReward(string memory id) public virtual  poolExist(id) updateReward(id, msg.sender) nonReentrant() {
        uint256 reward = rewards[id][msg.sender];
        StakingProfile storage p = pools[id];
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
    function exit (string memory id) public poolExist(id) nonReentrant(){
        getReward(id);
        withdraw(id,balanceOf[id][msg.sender]);
    }

/* 
*   @notice use with caution and if all users have unstaked and **collected rewards **
*   @dev since rewards are not checksd in case called with remaining rewards to give  
*   resupply with direct transfer of rwd token to contract
*/
    function cleanUp(string memory id) public poolExist(id){
        StakingProfile memory p = pools[id];
        if(msg.sender != p.rewardSupplier){
            revert notRewardSupplier();
        }
        if(block.timestamp>p.finishAt && p.totalSupply ==0){
            IERC20(p.rewardToken).safeTransfer(p.rewardSupplier,p.poolRewardBalance);
        } 
    }
    function setFeeCollector(address _feeCollector) external onlyRole(DEFAULT_ADMIN_ROLE){
        feeCollector = _feeCollector;
    }


    modifier poolExist(string memory id){
        if(pools[id].stakingToken == address(0)){
            revert noPool();
        }
        _;
    }
  
    modifier updateReward(string memory id,address _account){
        StakingProfile storage p = pools[id];
        p.rewardPerTokenStored = rewardPerToken(id);
        p.updatedAt = lastTimeRewardApplicable(id);
        if(_account != address(0)){
            rewards[id][_account] = earned(id, _account);
            userRewardPerTokenPaid[id][_account] = p.rewardPerTokenStored;
        }
        _;
    }
}

