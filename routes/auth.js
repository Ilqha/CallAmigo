const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../database");

const router = express.Router();

const JWT_SECRET =
    process.env.JWT_SECRET || "callamigo-development-secret";


// ==========================
// SIGN UP
// ==========================

router.post("/signup", async (req, res) => {

    try {

        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {

            return res.status(400).json({
                message: "Name, email and password are required."
            });

        }

        const existingUser = db
            .prepare("SELECT id FROM users WHERE email = ?")
            .get(email);

        if (existingUser) {

            return res.status(409).json({
                message: "An account with this email already exists."
            });

        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const result = db.prepare(`
            INSERT INTO users
            (name, email, password, phone, setup_completed)
            VALUES (?, ?, ?, ?, 0)
        `).run(
            name,
            email,
            hashedPassword,
            phone || null
        );

        const token = jwt.sign(
            {
                userId: result.lastInsertRowid,
                email
            },
            JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.status(201).json({

            message: "Account created successfully!",

            token

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            message:
                "Something went wrong while creating the account."

        });

    }

});


// ==========================
// LOGIN
// ==========================

router.post("/login", async (req, res) => {

    try {

        const { email, password } = req.body;

        if (!email || !password) {

            return res.status(400).json({

                message:
                    "Email and password are required."

            });

        }

        const user = db
            .prepare(
                "SELECT * FROM users WHERE email = ?"
            )
            .get(email);

        if (!user) {

            return res.status(401).json({

                message:
                    "Invalid email or password."

            });

        }

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!passwordMatch) {

            return res.status(401).json({

                message:
                    "Invalid email or password."

            });

        }

        const token = jwt.sign(

            {
                userId: user.id,
                email: user.email
            },

            JWT_SECRET,

            {
                expiresIn: "7d"
            }

        );

        res.json({

            message:
                "Login successful!",

            token,

            user: {

                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,

                language:
                    user.language,

                nativeLanguage:
                    user.native_language,

                level:
                    user.level,

                languageScoreType:
                    user.language_score_type,

                languageScore:
                    user.language_score,

                practiceMode:
                    user.practice_mode,

                streak: 
                    user.streak || 0,

                totalCalls: 
                    user.total_calls || 0,

                setupCompleted:
                    user.setup_completed === 1

            }

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            message:
                "Something went wrong while logging in."

        });

    }

});


// ==========================
// SAVE USER SETUP
// ==========================

router.post("/setup", (req, res) => {

    try {

        const token = req.headers.authorization;

        if (!token) {

            return res.status(401).json({
                message: "Not authenticated."
            });

        }

        const actualToken =
            token.replace("Bearer ", "");

        const decoded =
            jwt.verify(
                actualToken,
                JWT_SECRET
            );

        const userId =
            decoded.userId;

        const {
            language,
            nativeLanguage,
            level,
            languageScoreType,
            languageScore,
            practiceMode
        } = req.body;

        db.prepare(`
            UPDATE users
            SET
                language = ?,
                native_language = ?,
                level = ?,
                language_score_type = ?,
                language_score = ?,
                practice_mode = ?,
                setup_completed = 1
            WHERE id = ?
        `).run(
            language,
            nativeLanguage,
            level,
            languageScoreType || null,
            languageScore || null,
            practiceMode,
            userId
        );

        res.json({

            message:
                "Setup saved successfully!"

        });

    } catch (error) {

        console.error(error);

        res.status(401).json({

            message:
                "Invalid or expired token."

        });

    }

});
// COMPLETE CONVERSATION
router.post("/conversation-complete", (req, res) => {
    try {
        const token = req.headers.authorization;

        if (!token) {
            return res.status(401).json({
                message: "Not authenticated."
            });
        }

        const actualToken =
            token.replace("Bearer ", "");

        const decoded =
            jwt.verify(actualToken, JWT_SECRET);

        const userId = decoded.userId;

        db.prepare(`
            UPDATE users
            SET
                total_calls = total_calls + 1,
                streak = streak + 1
            WHERE id = ?
        `).run(userId);

        const user = db
            .prepare(`
                SELECT streak, total_calls
                FROM users
                WHERE id = ?
            `)
            .get(userId);

        res.json({
            message: "Conversation completed!",
            streak: user.streak,
            totalCalls: user.total_calls
        });

    } catch (error) {
        console.error(error);

        res.status(401).json({
            message: "Invalid or expired token."
        });
    }
});

// ==========================
// GET CURRENT USER
// ==========================

router.get("/me", (req, res) => {

    try {

        const token = req.headers.authorization;

        if (!token) {
            return res.status(401).json({
                message: "Not authenticated."
            });
        }

        const actualToken =
            token.replace("Bearer ", "");

        const decoded =
            jwt.verify(
                actualToken,
                JWT_SECRET
            );

        const user =
            db.prepare(`
                SELECT
                    id,
                    name,
                    email,
                    phone,
                    language,
                    native_language,
                    level,
                    language_score_type,
                    language_score,
                    practice_mode,
                    streak,
                    total_calls,
                    setup_completed
                FROM users
                WHERE id = ?
            `).get(decoded.userId);


        if (!user) {

            return res.status(404).json({
                message: "User not found."
            });

        }


        res.json({

            user: {

                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,

                language: user.language,

                nativeLanguage:
                    user.native_language,

                level: user.level,

                languageScoreType:
                    user.language_score_type,

                languageScore:
                    user.language_score,

                practiceMode:
                    user.practice_mode,

                streak:
                    user.streak || 0,

                totalCalls:
                    user.total_calls || 0,

                setupCompleted:
                    user.setup_completed === 1

            }

        });

    } catch (error) {

        console.error(error);

        res.status(401).json({
            message:
                "Invalid or expired token."
        });

    }

});
module.exports = router;
