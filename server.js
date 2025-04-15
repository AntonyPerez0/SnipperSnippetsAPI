require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken"); // Add JWT library

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

// JWT configuration
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const JWT_EXPIRATION = "24h"; // Token expires after 24 hours

// Encryption setup and functions (unchanged)
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
      userId: snippet.userId || null, // Add userId to track ownership
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

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header required" });
  }

  const token = authHeader.split(" ")[1]; // Format: "Bearer TOKEN"
  if (!token) {
    return res.status(401).json({ message: "Bearer token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// --- API Endpoints ---

// Welcome route
app.get("/", (req, res) => {
  res.send("Welcome to the Snippr API!");
});

// User login route - NEW
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  try {
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRATION,
    });

    res.status(200).json({
      message: "Login successful",
      token,
      expiresIn: JWT_EXPIRATION,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error during login" });
  }
});

// Snippet routes (Public)
app.get("/snippets", (req, res) => {
  const language = req.query.lang;
  let results = snippets.filter((snippet) => snippet.userId === null); // Only public snippets

  if (language) {
    results = results.filter(
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
    // Only return public snippets or check authorization for private ones
    if (snippet.userId !== null) {
      return res
        .status(403)
        .json({ message: "This snippet requires authentication" });
    }

    const decryptedSnippet = {
      ...snippet,
      code: decrypt(snippet.code),
    };
    res.status(200).json(decryptedSnippet);
  } else {
    res.status(404).json({ message: `Snippet with ID ${id} not found.` });
  }
});

// User-specific snippets - NEW
app.get("/user/snippets", authenticateToken, (req, res) => {
  const userSnippets = snippets.filter(
    (snippet) => snippet.userId === req.user.id,
  );

  const decryptedResults = userSnippets.map((snippet) => ({
    ...snippet,
    code: decrypt(snippet.code),
  }));

  res.status(200).json(decryptedResults);
});

// Get a specific user snippet - NEW
app.get("/user/snippets/:id", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const snippet = snippets.find((s) => s.id === id && s.userId === req.user.id);

  if (!snippet) {
    return res
      .status(404)
      .json({ message: "Snippet not found or access denied" });
  }

  const decryptedSnippet = {
    ...snippet,
    code: decrypt(snippet.code),
  };

  res.status(200).json(decryptedSnippet);
});

// Creating a new snippet (authorized)
app.post("/user/snippets", authenticateToken, (req, res) => {
  const { language, code, isPrivate = true } = req.body;

  if (!language || !code) {
    return res
      .status(400)
      .json({ message: "Missing required fields: language and code" });
  }

  const newSnippet = {
    id: nextSnippetId++,
    language: language,
    code: encrypt(code),
    userId: isPrivate ? req.user.id : null, // Private snippets belong to user, public are null
  };

  snippets.push(newSnippet);
  res.status(201).json({
    ...newSnippet,
    code: decrypt(newSnippet.code),
  });
});

// Creating a public snippet (anonymous)
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
    userId: null, // Public snippets
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

// Get user profile - NEW
app.get("/user/profile", authenticateToken, (req, res) => {
  const user = users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    id: user.id,
    email: user.email,
  });
});

// Start the server
app.listen(PORT, () => {
  loadSeedData();
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("JWT Authentication enabled. Tokens expire after 24 hours.");
});
