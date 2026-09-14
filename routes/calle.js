const express = require("express");
const jwt = require("jsonwebtoken");

const db = require("../database");

const router = express.Router();

const JWT_SECRET =
    process.env.JWT_SECRET || "callamigo-development-secret";


// =====================================================
// START CALL
// =====================================================

router.post("/start", async (req, res) => {

    try {

        // AUTHENTICATE USER

        const token = req.headers.authorization;

        if (!token) {
            return res.status(401).json({
                message: "Not authenticated."
            });
        }

        const actualToken = token.replace("Bearer ", "");

        const decoded = jwt.verify(
            actualToken,
            JWT_SECRET
        );

        const userId = decoded.userId;


        // GET USER FROM DATABASE

        const user = db.prepare(`
            SELECT
                name,
                phone,
                language,
                native_language,
                level
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }


        // GET CALL INFORMATION

        const {
            task,
            situation
        } = req.body;


        // VALIDATION

        if (!user.phone) {
            return res.status(400).json({
                message: "Phone number is required."
            });
        }

        if (!user.language) {
            return res.status(400).json({
                message: "Learning language is required."
            });
        }

        if (!user.native_language) {
            return res.status(400).json({
                message: "Native language is required."
            });
        }

        if (!user.level) {
            return res.status(400).json({
                message: "Language level is required."
            });
        }

        if (!process.env.CALLE_API_KEY) {
            return res.status(500).json({
                message: "CALL-E API key is not configured."
            });
        }


        // BUILD CALLAMIGO TASK

        let callTask = `

You are CallAmigo, an AI language conversation partner.

Start the phone call naturally by saying:

"Hello, this is CallAmigo. I'm here to help you practice ${user.language}."

The learner's information:

Learning language: ${user.language}
Native language: ${user.native_language}
Proficiency level: ${user.level}

Your main purpose is to help the learner practice speaking ${user.language}
through a natural phone conversation.

IMPORTANT BEHAVIOR:

1. Speak naturally and warmly.
2. Keep the conversation appropriate for the learner's level.
3. Do not make the conversation feel like a classroom lesson.
4. Ask questions and allow the learner to respond.
5. Encourage the learner to speak rather than doing all the talking.
6. Gently correct important mistakes when useful.
7. If the learner asks for the meaning of a word or phrase,
   explain it naturally using their native language when helpful,
   then continue the conversation in ${user.language}.
8. Adapt your questions to the learner's responses.
9. Do not repeatedly interrupt the learner.
10. Keep the conversation friendly and encouraging.
11. End the conversation naturally when the practice is complete.

The goal is real conversation practice, not memorization or a scripted dialogue.

`;


        // SITUATION

        if (situation) {

            callTask += `

The learner selected this conversation situation:

${situation}

Keep the conversation naturally focused on this situation.

Do not simply read a fixed script.
React naturally to what the learner says.

`;

        } else {

            callTask += `

No specific situation was selected.

Have a natural everyday conversation in ${user.language}.

`;

        }


        // EXTRA TASK

        if (task) {

            callTask += `

Additional conversation instructions:

${task}

`;

        }


        // CREATE CALL-E CALL

        const response = await fetch(
            "https://api.heycall-e.com/v1/calls",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    "Authorization":
                        `Bearer ${process.env.CALLE_API_KEY}`
                },

                body: JSON.stringify({

                    task: callTask,

                    recipients: [
                        {
                            phones: [user.phone]
                        }
                    ],

                    metadata: {

                        product: "CallAmigo",

                        userId: String(userId),

                        language: user.language,

                        nativeLanguage:
                            user.native_language,

                        level: user.level,

                        situation:
                            situation || "normal"

                    }

                })
            }
        );


        const data = await response.json();


        // CALL-E ERROR

        if (!response.ok) {

            console.error(
                "CALL-E error:",
                data
            );

            return res.status(response.status).json({

                message:
                    "CALL-E could not start the call.",

                error: data

            });

        }


        // SAVE CALL IN DATABASE

        db.prepare(`

            INSERT INTO conversations (

                user_id,
                call_id,
                language,
                native_language,
                level,
                situation,
                status

            )

            VALUES (?, ?, ?, ?, ?, ?, ?)

        `).run(

            userId,

            data.id,

            user.language,

            user.native_language,

            user.level,

            situation || null,

            data.status || "queued"

        );


        // SUCCESS

        res.json({

            message:
                "CallAmigo call created successfully.",

            callId:
                data.id,

            status:
                data.status,

            call:
                data

        });


    } catch (error) {

        console.error(
            "CALL-E connection error:",
            error
        );

        res.status(500).json({

            message:
                "Failed to connect to CALL-E.",

            error:
                error.message

        });

    }

});



// =====================================================
// GET CALL STATUS / RESULT
// =====================================================

router.get("/status/:callId", async (req, res) => {

    try {

        // AUTHENTICATE

        const token =
            req.headers.authorization;

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

        const callId =
            req.params.callId;


        // CHECK OWNERSHIP

        const conversation =
            db.prepare(`

                SELECT *
                FROM conversations
                WHERE call_id = ?
                AND user_id = ?

            `).get(
                callId,
                userId
            );


        if (!conversation) {

            return res.status(404).json({

                message:
                    "Conversation not found."

            });

        }


        // GET CALL-E RESULT

        const response =
            await fetch(

                `https://api.heycall-e.com/v1/calls/${callId}`,

                {

                    method: "GET",

                    headers: {

                        "Authorization":
                            `Bearer ${process.env.CALLE_API_KEY}`

                    }

                }

            );


        const data =
            await response.json();


        if (!response.ok) {

            return res.status(
                response.status
            ).json({

                message:
                    "Could not retrieve CALL-E result.",

                error:
                    data

            });

        }


        // =================================================
        // EXTRACT REAL CALL-E RESULT
        // =================================================

        const transcript =
            data.transcript_turns
                ? JSON.stringify(data.transcript_turns)
                : null;

        const summary =
            data.summary || null;

        const completedAt =
            data.completed_at || null;


        // =================================================
        // SAVE RESULT
        // =================================================

        db.prepare(`

            UPDATE conversations

            SET
                status = ?,
                summary = ?,
                transcript = ?,
                feedback = ?,
                completed_at = ?

            WHERE call_id = ?
            AND user_id = ?

        `).run(

            data.status || null,

            summary,

            transcript,

            data.structured_result
                ? JSON.stringify(data.structured_result)
                : null,

            completedAt,

            callId,

            userId

        );


        // =================================================
        // UPDATE AUTHENTIC STATS
        // =================================================

        let userStats = null;

        if (data.status === "completed") {

            userStats =
                updateAuthenticStats(userId);

        }


        // =================================================
        // RETURN RESULT
        // =================================================

        res.json({

            callId:
                callId,

            status:
                data.status,

            summary:
                summary,

            transcriptTurns:
                data.transcript_turns || null,

            structuredResult:
                data.structured_result || null,

            taskCompleted:
                data.task_completed || null,

            completionConfidence:
                data.completion_confidence || null,

            completedAt:
                completedAt,

            userStats:
                userStats,

            call:
                data

        });


    } catch (error) {

        console.error(
            "CALL-E status error:",
            error
        );

        res.status(500).json({

            message:
                "Failed to retrieve call result.",

            error:
                error.message

        });

    }

});



// =====================================================
// UPDATE AUTHENTIC USER STATS
// =====================================================

function updateAuthenticStats(userId) {

    // COUNT ONLY REAL COMPLETED CALLS

    const totalCalls =
        db.prepare(`

            SELECT COUNT(*) AS total

            FROM conversations

            WHERE user_id = ?

            AND status = 'completed'

        `).get(userId).total;


    // GET REAL PRACTICE DAYS

    const rows =
        db.prepare(`

            SELECT DISTINCT
                DATE(completed_at) AS practice_date

            FROM conversations

            WHERE user_id = ?

            AND status = 'completed'

            AND completed_at IS NOT NULL

            ORDER BY practice_date DESC

        `).all(userId);


    let streak = 0;


    if (rows.length > 0) {

        const latestDate =
            new Date(
                rows[0].practice_date +
                "T00:00:00Z"
            );


        const today =
            new Date();


        const todayDate =
            new Date(
                Date.UTC(
                    today.getUTCFullYear(),
                    today.getUTCMonth(),
                    today.getUTCDate()
                )
            );


        const daysSinceLatest =
            Math.round(
                (
                    todayDate -
                    latestDate
                ) /
                (1000 * 60 * 60 * 24)
            );


        // STREAK ACTIVE IF PRACTICED
        // TODAY OR YESTERDAY

        if (daysSinceLatest <= 1) {

            streak = 1;


            for (
                let i = 1;
                i < rows.length;
                i++
            ) {

                const previous =
                    new Date(
                        rows[i - 1].practice_date +
                        "T00:00:00Z"
                    );


                const current =
                    new Date(
                        rows[i].practice_date +
                        "T00:00:00Z"
                    );


                const difference =
                    Math.round(
                        (
                            previous -
                            current
                        ) /
                        (1000 * 60 * 60 * 24)
                    );


                if (difference === 1) {

                    streak++;

                } else {

                    break;

                }

            }

        }

    }


    // SAVE REAL VALUES

    db.prepare(`

        UPDATE users

        SET
            total_calls = ?,
            streak = ?

        WHERE id = ?

    `).run(

        totalCalls,
        streak,
        userId

    );


    return {

        totalCalls,
        streak

    };

}



// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;
