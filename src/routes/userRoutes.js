const express = require('express');
const { getProfile, updateOnboarding, updateProfile } = require('../controllers/userController');
const { redeemInvitationCode, claimInvitationReward } = require('../controllers/invitationController');
const {
  invitationRedeemRateLimit,
  invitationBasicWaf,
} = require('../middleware/invitationRateLimit');
const { profileAvatarUploadRateLimit } = require('../middleware/profileAvatarRateLimit');

const router = express.Router();

router.get('/:userId/profile', getProfile);
router.put('/:userId/onboarding', updateOnboarding);
router.put('/:userId/profile', profileAvatarUploadRateLimit, updateProfile);
router.post(
  '/:userId/invitation/redeem',
  invitationRedeemRateLimit,
  invitationBasicWaf,
  redeemInvitationCode,
);
router.post('/:userId/invitation/claim', claimInvitationReward);

module.exports = router;
