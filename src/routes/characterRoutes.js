const express = require('express');
const {
  listCharactersForUser,
  getCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  saveCharacter,
  unsaveCharacter,
  listSavedCharacters,
} = require('../controllers/characterController');

const router = express.Router();

router.get('/:userId/characters', listCharactersForUser);
router.post('/:userId/characters', createCharacter);
router.get('/:userId/characters/saved', listSavedCharacters);
router.get('/:userId/characters/:characterId', getCharacter);
router.patch('/:userId/characters/:characterId', updateCharacter);
router.delete('/:userId/characters/:characterId', deleteCharacter);
router.post('/:userId/characters/:characterId/save', saveCharacter);
router.delete('/:userId/characters/:characterId/save', unsaveCharacter);

module.exports = router;
