const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Family = require('../models/Family');

const PASSWORD = process.env.ADMIN_PASSWORD || '123';

function normalizeName(name = '') {
  return name.trim();
}

router.get('/', async (req, res) => {
  try {
    const [groups, expenseStats, familyStats] = await Promise.all([
      Group.find().sort({ createdAt: 1 }),
      Expense.aggregate([
        { $group: { _id: '$group', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Family.aggregate([
        { $group: { _id: '$group', count: { $sum: 1 } } }
      ])
    ]);

    const expenseMap = expenseStats.reduce((acc, stat) => {
      acc[stat._id?.toString()] = stat;
      return acc;
    }, {});

    const familyMap = familyStats.reduce((acc, stat) => {
      acc[stat._id?.toString()] = stat;
      return acc;
    }, {});

    const payload = groups.map(group => {
      const groupId = group._id.toString();
      return {
        ...group.toObject(),
        metrics: {
          totalExpenses: expenseMap[groupId]?.totalAmount || 0,
          expenseCount: expenseMap[groupId]?.count || 0,
          familyCount: familyMap[groupId]?.count || 0
        }
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Unable to fetch groups.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    const [expenseStats, familyStats] = await Promise.all([
      Expense.aggregate([
        { $match: { group: group._id } },
        { $group: { _id: '$group', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Family.aggregate([
        { $match: { group: group._id } },
        { $group: { _id: '$group', count: { $sum: 1 } } }
      ])
    ]);

    const metrics = {
      totalExpenses: expenseStats[0]?.totalAmount || 0,
      expenseCount: expenseStats[0]?.count || 0,
      familyCount: familyStats[0]?.count || 0
    };

    res.json({
      ...group.toObject(),
      metrics
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ message: 'Unable to fetch group.' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (req.body.password !== PASSWORD) {
      return res.status(403).json({ message: 'Invalid password for creating group.' });
    }

    const name = normalizeName(req.body.name || '');
    const description = req.body.description?.trim();

    if (!name) {
      return res.status(400).json({ message: 'Group name is required.' });
    }

    const existing = await Group.findOne({ name: new RegExp(`^${name}$`, 'i') });
    if (existing) {
      return res.status(409).json({ message: 'Group with this name already exists.' });
    }

    const group = await Group.create({
      name,
      description,
      status: 'active'
    });

    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Unable to create group.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    const updates = {};

    if (req.body.name) {
      const name = normalizeName(req.body.name);
      if (!name) {
        return res.status(400).json({ message: 'Group name cannot be empty.' });
      }

      const duplicate = await Group.findOne({
        _id: { $ne: group._id },
        name: new RegExp(`^${name}$`, 'i')
      });
      if (duplicate) {
        return res.status(409).json({ message: 'Another group already has this name.' });
      }
      updates.name = name;
    }

    if (req.body.description !== undefined) {
      updates.description = req.body.description?.trim();
    }

    if (req.body.status) {
      const nextStatus = req.body.status;
      if (!['active', 'closed'].includes(nextStatus)) {
        return res.status(400).json({ message: 'Invalid status.' });
      }

      if (group.status !== nextStatus) {
        if (group.status === 'active' && nextStatus === 'closed') {
          if (req.body.password !== PASSWORD) {
            return res.status(403).json({ message: 'Invalid password for closing group.' });
          }
        }
        if (group.status === 'closed' && nextStatus === 'active') {
          if (req.body.password !== PASSWORD) {
            return res.status(403).json({ message: 'Invalid password for reopening group.' });
          }
        }
        updates.status = nextStatus;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No changes provided.' });
    }

    const updatedGroup = await Group.findByIdAndUpdate(group._id, updates, { new: true });
    res.json(updatedGroup);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ message: 'Unable to update group.' });
  }
});

module.exports = router;

