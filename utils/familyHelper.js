const Family = require('../models/Family');

function getFamiliesSorted(groupId) {
  return Family.find({ group: groupId }).sort({ name: 1 });
}

module.exports = {
  getFamiliesSorted
};

