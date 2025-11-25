const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Family = require('../models/Family');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const { getFamiliesSorted } = require('../utils/familyHelper');

const PASSWORD = process.env.ADMIN_PASSWORD || '123';

// Helper to normalise family names
function normaliseName(name = '') {
  return name.trim();
}

async function resolveGroup(req, res) {
  const groupId = req.query.groupId || req.body.groupId;
  if (!groupId) {
    res.status(400).json({ message: 'groupId is required.' });
    return null;
  }
  try {
    // Ensure groupId is converted to ObjectId for proper comparison
    const groupObjectId = mongoose.Types.ObjectId.isValid(groupId) 
      ? new mongoose.Types.ObjectId(groupId) 
      : groupId;
    const group = await Group.findById(groupObjectId);
    if (!group) {
      res.status(404).json({ message: 'Group not found.' });
      return null;
    }
    return group;
  } catch (error) {
    console.error('Error resolving group:', error);
    res.status(500).json({ message: 'Unable to resolve group.' });
    return null;
  }
}

// Get all families
router.get('/', async (req, res) => {
  try {
    const group = await resolveGroup(req, res);
    if (!group) return;

    const [families, usage] = await Promise.all([
      getFamiliesSorted(group._id),
      Expense.aggregate([
        { $match: { group: group._id } },
        { $group: { _id: '$familyName', count: { $sum: 1 } } }
      ])
    ]);

    const usageMap = usage.reduce((acc, curr) => {
      if (curr._id) {
        acc[curr._id.toLowerCase()] = curr.count;
      }
      return acc;
    }, {});

    const payload = families.map((family) => {
      const familyObj = family.toObject();
      return {
        ...familyObj,
        hasExpenses: Boolean(usageMap[familyObj.name.toLowerCase()])
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Error fetching families:', error);
    res.status(500).json({ message: 'Unable to fetch families.' });
  }
});

// Add a new family
router.post('/', async (req, res) => {
  try {
    const group = await resolveGroup(req, res);
    if (!group) return;

    if (group.status === 'closed') {
      return res.status(400).json({ message: 'Cannot modify a closed group.' });
    }

    if (req.body.password !== PASSWORD) {
      return res.status(403).json({ message: 'Invalid password for adding family.' });
    }

    const name = normaliseName(req.body.name || '');
    const members = Number(req.body.members);

    if (!name) {
      return res.status(400).json({ message: 'Family name is required.' });
    }

    if (!Number.isInteger(members) || members < 0 || members > 10) {
      return res.status(400).json({ message: 'Members must be an integer between 0 and 10.' });
    }

    // Check if family with same name exists in THIS group only
    // Use case-insensitive comparison - escape regex special characters
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Query to find family with same name in THIS specific group only
    // group._id is already an ObjectId from Mongoose
    const existing = await Family.findOne({ 
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }, 
      group: group._id
    });
    
    if (existing) {
      // Verify the found family is actually in the same group (safety check)
      const existingGroupId = existing.group.toString();
      const currentGroupId = group._id.toString();
      
      if (existingGroupId !== currentGroupId) {
        // This should never happen, but if it does, log it and allow creation
        console.error(`ERROR: Query found family "${name}" in group ${existingGroupId} but searching in group ${currentGroupId}`);
      } else {
        return res.status(409).json({ message: 'Family already exists in this group.' });
      }
    }

    const family = new Family({ name, members, group: group._id });
    const newFamily = await family.save();
    res.status(201).json(newFamily);
  } catch (error) {
    console.error('Error adding family:', error);
    if (error.code === 11000) {
      // Check if it's the old name_1 index error
      if (error.keyPattern && error.keyPattern.name === 1 && !error.keyPattern.group) {
        return res.status(500).json({ 
          message: 'Database index error. Please restart the server to fix indexes, or contact support.' 
        });
      }
      return res.status(409).json({ message: 'Family already exists in this group.' });
    }
    res.status(500).json({ message: 'Unable to add family.' });
  }
});

// Update family members
router.patch('/:id', async (req, res) => {
  try {
    const family = await Family.findById(req.params.id);
    if (!family) {
      return res.status(404).json({ message: 'Family not found.' });
    }

    const group = await Group.findById(family.group);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    if (group.status === 'closed') {
      return res.status(400).json({ message: 'Cannot modify a closed group.' });
    }

    const members = Number(req.body.members);

    if (!Number.isInteger(members) || members < 0 || members > 10) {
      return res.status(400).json({ message: 'Members must be an integer between 0 and 10.' });
    }

    family.members = members;
    const updated = await family.save();

    res.json(updated);
  } catch (error) {
    console.error('Error updating family:', error);
    res.status(500).json({ message: 'Unable to update family.' });
  }
});

// Delete family (only if no expenses)
router.delete('/:id', async (req, res) => {
  try {
    const family = await Family.findById(req.params.id);
    if (!family) {
      return res.status(404).json({ message: 'Family not found.' });
    }

    const group = await Group.findById(family.group);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    if (group.status === 'closed') {
      return res.status(400).json({ message: 'Cannot modify a closed group.' });
    }

    if (req.body.password !== PASSWORD) {
      return res.status(403).json({ message: 'Invalid password for deleting family.' });
    }

    const expenseExists = await Expense.exists({ familyName: family.name, group: family.group });
    if (expenseExists) {
      return res.status(400).json({
        message: 'Cannot delete a family that has recorded expenses.'
      });
    }

    await family.deleteOne();
    res.json({ message: 'Family deleted successfully.' });
  } catch (error) {
    console.error('Error deleting family:', error);
    res.status(500).json({ message: 'Unable to delete family.' });
  }
});

module.exports = router;

