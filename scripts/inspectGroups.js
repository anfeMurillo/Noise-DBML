const { Parser } = require('@dbml/core');

const dbml = `Table users {
  id int [pk]
}

Table posts {
  id int [pk]
  user_id int
}

TableGroup "User Group" {
  users
  posts

  Note: '''
  Example note
  '''
}`;

const db = Parser.parse(dbml, 'dbml');
const groups = db.schemas[0].tableGroups.map(group => ({
  name: group.name,
  color: group.color,
  note: group.note,
  tables: group.tables.map(t => t.name)
}));
console.log(JSON.stringify(groups, null, 2));
