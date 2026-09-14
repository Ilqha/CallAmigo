const Database = require("better-sqlite3");

const db = new Database("callamigo.db");


// =====================================================
// USERS TABLE
// =====================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,

        language TEXT,
        native_language TEXT,
        level TEXT,

        language_score_type TEXT,
        language_score TEXT,

        practice_mode TEXT,

        practice_time TEXT,
        frequency TEXT,

        setup_completed INTEGER DEFAULT 0,

        streak INTEGER DEFAULT 0,
        total_calls INTEGER DEFAULT 0,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);


// =====================================================
// CONVERSATIONS TABLE
// =====================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id INTEGER NOT NULL,

        call_id TEXT UNIQUE,

        language TEXT,
        native_language TEXT,
        level TEXT,

        situation TEXT,

        status TEXT,

        summary TEXT,

        transcript TEXT,

        feedback TEXT,

        score INTEGER,

        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        completed_at DATETIME,

        FOREIGN KEY (user_id)
            REFERENCES users(id)

    )
`);


// =====================================================
// KEEP EXISTING DATABASE COMPATIBLE
// =====================================================

const columns = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map(column => column.name);


const newColumns = [

    ["native_language", "TEXT"],

    ["language_score_type", "TEXT"],

    ["language_score", "TEXT"],

    ["practice_mode", "TEXT"],

    ["setup_completed", "INTEGER DEFAULT 0"]

];


for (const [column, type] of newColumns) {

    if (!columns.includes(column)) {

        db.exec(`
            ALTER TABLE users
            ADD COLUMN ${column} ${type}
        `);

    }

}


module.exports = db;