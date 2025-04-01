// Required libraries
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

// Encryption setup and functions
const algorithm = "aes-256-cbc";
const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
if (key.length !== 32) {
  console.error(
    "FATAL ERROR: ENCRYPTION_KEY must be a 32-byte hex string (64 characters).",
  );
  process.exit(1);
}
const ivLength = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
  try {
    const parts = text.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted text format");
    }
    const iv = Buffer.from(parts.shift(), "hex");
    if (iv.length !== ivLength) {
      throw new Error("Invalid IV length");
    }
    const encryptedText = Buffer.from(parts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[Decryption Error]";
  }
}

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage and initial data loading
let snippets = [];
let nextSnippetId = 1;
let users = [];
let nextUserId = 1;

function loadSeedData() {
  try {
    const dataPath = path.join(__dirname, "data", "seedData.json");
    const seedDataRaw = fs.readFileSync(dataPath, "utf8");
    const seedSnippets = JSON.parse(seedDataRaw);

    snippets = seedSnippets.map((snippet) => ({
      ...snippet,
      code: encrypt(snippet.code),
    }));

    if (snippets.length > 0) {
      const maxId = Math.max(...snippets.map((s) => s.id));
      nextSnippetId = maxId + 1;
    } else {
      nextSnippetId = 1;
    }
    console.log(
      `Loaded and encrypted ${snippets.length} snippets from seed data. Next Snippet ID will be ${nextSnippetId}.`,
    );
  } catch (error) {
    console.error("Could not load seed data:", error);
    snippets = [];
    nextSnippetId = 1;
  }
  users = [];
  nextUserId = 1;
  console.log(`User store initialized. Next User ID will be ${nextUserId}.`);
}

// --- API Endpoints ---

// Welcome route
app.get("/", (req, res) => {
  res.send("Welcome to the Snippr API!");
});

// Snippet routes (Get All, Get One, Create New)
app.get("/snippets", (req, res) => {
  const language = req.query.lang;
  let results = snippets;

  if (language) {
    results = snippets.filter(
      (snippet) =>
        decrypt(snippet.code) !== "[Decryption Error]" &&
        snippet.language.toLowerCase() === language.toLowerCase(),
    );
  }

  const decryptedResults = results.map((snippet) => ({
    ...snippet,
    code: decrypt(snippet.code),
  }));

  res.status(200).json(decryptedResults);
});

app.get("/snippets/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const snippet = snippets.find((s) => s.id === id);

  if (snippet) {
    const decryptedSnippet = {
      ...snippet,
      code: decrypt(snippet.code),
    };
    res.status(200).json(decryptedSnippet);
  } else {
    res.status(404).json({ message: `Snippet with ID ${id} not found.` });
  }
});

app.post("/snippets", (req, res) => {
  const { language, code } = req.body;

  if (!language || !code) {
    return res
      .status(400)
      .json({ message: "Missing required fields: language and code" });
  }

  const newSnippet = {
    id: nextSnippetId++,
    language: language,
    code: encrypt(code),
  };

  snippets.push(newSnippet);
  res.status(201).json({
    ...newSnippet,
    code: decrypt(newSnippet.code),
  });
});

// User creation route
app.post("/user", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Missing required fields: email and password" });
  }

  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res
      .status(409)
      .json({ message: "User with this email already exists." });
  }

  try {
    const saltRounds = parseInt(process.env.SALT_ROUNDS || "10", 10);
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = {
      id: nextUserId++,
      email: email,
      passwordHash: hashedPassword,
    };

    users.push(newUser);
    console.log(
      `User created: ${JSON.stringify({ id: newUser.id, email: newUser.email })}`,
    );

    res.status(201).json({
      id: newUser.id,
      email: newUser.email,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res
      .status(500)
      .json({ message: "Internal server error during user creation." });
  }
});

// Start the server
app.listen(PORT, () => {
  loadSeedData();
  console.log(`Server is running on http://localhost:${PORT}`);
});
