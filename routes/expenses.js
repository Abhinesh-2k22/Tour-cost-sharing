const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const Family = require('../models/Family');
const Group = require('../models/Group');
const { getFamiliesSorted } = require('../utils/familyHelper');

async function resolveGroup(req, res) {
  const groupId = req.query.groupId || req.body.groupId;
  if (!groupId) {
    res.status(400).json({ message: 'groupId is required.' });
    return null;
  }
  try {
    const group = await Group.findById(groupId);
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

// Get all expenses
router.get('/', async (req, res) => {
  try {
    const group = await resolveGroup(req, res);
    if (!group) return;
    const expenses = await Expense.find({ group: group._id }).sort({ date: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new expense
router.post('/', async (req, res) => {
  try {
    const group = await resolveGroup(req, res);
    if (!group) return;

    if (group.status === 'closed') {
      return res.status(400).json({ message: 'Cannot modify a closed group.' });
    }

    const familyExists = await Family.findOne({
      name: req.body.familyName,
      group: group._id
    });

    if (!familyExists) {
      return res.status(400).json({ message: 'Family does not exist in this group.' });
    }

    const expense = new Expense({
      description: req.body.description,
      amount: req.body.amount,
      familyName: req.body.familyName,
      group: group._id
    });

    const newExpense = await expense.save();
    res.status(201).json(newExpense);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Calculate settlements
router.get('/settlements', async (req, res) => {
  try {
    const group = await resolveGroup(req, res);
    if (!group) return;

    const expenses = await Expense.find({ group: group._id });
    const families = await getFamiliesSorted(group._id);
    
    // Calculate total members and total expenses
    const totalMembers = families.reduce((sum, family) => sum + family.members, 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const perPersonShare = totalMembers > 0 ? totalExpenses / totalMembers : 0;

    // Calculate each family's share and what they paid
    const familyBalances = families.map((family) => {
      const familyShare = perPersonShare * family.members;
      const familyPaid = expenses
        .filter(expense => expense.familyName === family.name)
        .reduce((sum, expense) => sum + expense.amount, 0);
      
      return {
        family: family.name,
        members: family.members,
        share: familyShare,
        paid: familyPaid,
        balance: familyPaid - familyShare
      };
    });

    // Calculate settlements
    const settlements = [];
    const settlementBalances = JSON.parse(JSON.stringify(familyBalances));

    const debtors = settlementBalances.filter(f => f.balance < 0).sort((a, b) => a.balance - b.balance);
    const creditors = settlementBalances.filter(f => f.balance > 0).sort((a, b) => b.balance - a.balance);

    for (const debtor of debtors) {
      let remainingDebt = Math.abs(debtor.balance);
      
      for (const creditor of creditors) {
        if (remainingDebt <= 0 || creditor.balance <= 0) continue;
        
        const amount = Math.min(remainingDebt, creditor.balance);
        if (amount > 0) {
          settlements.push({
            from: debtor.family,
            to: creditor.family,
            amount: amount.toFixed(2)
          });
          
          remainingDebt -= amount;
          creditor.balance -= amount;
        }
      }
    }

    res.json({
      totalExpenses,
      totalMembers,
      perPersonShare,
      familyBalances,
      settlements
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update expense amount and/or family
router.patch('/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found.' });
    }

    const group = await Group.findById(expense.group);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    if (group.status === 'closed') {
      return res.status(400).json({ message: 'Cannot modify a closed group.' });
    }

    const updates = {};
    const { amount, familyName } = req.body;

    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ message: 'Amount must be a positive number.' });
      }
      updates.amount = parsedAmount;
    }

    if (familyName) {
      const familyExists = await Family.exists({ name: familyName, group: group._id });
      if (!familyExists) {
        return res.status(400).json({ message: 'Family does not exist.' });
      }
      updates.familyName = familyName;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Nothing to update.' });
    }

    Object.assign(expense, updates);
    const updatedExpense = await expense.save();

    res.json(updatedExpense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ message: 'Unable to update expense.' });
  }
});

// Delete expense
router.delete('/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found.' });
    }

    const group = await Group.findById(expense.group);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    if (group.status === 'closed') {
      return res.status(400).json({ message: 'Cannot modify a closed group.' });
    }

    await expense.deleteOne();

    res.json({ message: 'Expense deleted successfully.' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ message: 'Unable to delete expense.' });
  }
});

module.exports = router; 
module.exports = router; 