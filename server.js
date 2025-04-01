const express = require("express");
const fs = require("fs"); // Node.js file system module
const path = require("path"); // Node.js path module

const app = express();
const PORT = process.env.PORT || 3000; // Use environment variable or default to 3000

// --- Middleware ---
// Enable parsing of JSON request bodies (for POST requests)
app.use(express.json());
// Enable parsing of URL-encoded request bodies (optional but common)
app.use(express.urlencoded({ extended: true }));

// --- In-Memory Data Store ---
let snippets = []; // Will be populated by loadSeedData
let nextId = 1; // Will be updated by loadSeedData

// Updated function to load seed data WITH pre-assigned IDs
function loadSeedData() {
  try {
    // Construct the full path to the seed data file
    const dataPath = path.join(__dirname, "data", "seedData.json");
    // Read the file content
    const seedDataRaw = fs.readFileSync(dataPath, "utf8");
    // Parse the JSON data
    const seedSnippets = JSON.parse(seedDataRaw);

    // Use the seed data directly as it contains IDs
    snippets = seedSnippets;

    // Determine the next ID based on the highest existing ID in the seed data
    if (snippets.length > 0) {
      // Find the maximum ID value among all snippets
      const maxId = Math.max(...snippets.map((s) => s.id));
      // Set the next ID to be one greater than the current maximum
      nextId = maxId + 1;
    } else {
      // If the seed file was empty or didn't load, start IDs from 1
      nextId = 1;
    }

    console.log(
      `Loaded ${snippets.length} snippets from seed data. Next ID will be ${nextId}.`,
    );
  } catch (error) {
    console.error("Could not load seed data:", error);
    // Fallback: Start with an empty array and ID 1 if seed data loading fails
    snippets = [];
    nextId = 1;
  }
}

// --- API Endpoints ---

// Root endpoint (optional: basic check if the server is up)
app.get("/", (req, res) => {
  res.send("Welcome to the Snippr API!");
});

// GET /snippets - Retrieve all snippets or filter by language
app.get("/snippets", (req, res) => {
  // Check for the ?lang= query parameter (e.g., /snippets?lang=python)
  const language = req.query.lang;

  if (language) {
    // Filter snippets by language (case-insensitive comparison)
    const filteredSnippets = snippets.filter(
      (snippet) => snippet.language.toLowerCase() === language.toLowerCase(),
    );
    // Return the filtered snippets (or an empty array if none match)
    res.status(200).json(filteredSnippets);
  } else {
    // No language filter provided, return all snippets
    res.status(200).json(snippets);
  }
});

// GET /snippets/:id - Retrieve a specific snippet by its ID
app.get("/snippets/:id", (req, res) => {
  // Get the ID from the URL parameter (e.g., /snippets/3)
  // req.params.id comes in as a string, so parse it to an integer
  const id = parseInt(req.params.id, 10);

  // Find the snippet in the 'snippets' array with the matching ID
  const snippet = snippets.find((s) => s.id === id);

  if (snippet) {
    // If a snippet with that ID was found, return it with 200 OK
    res.status(200).json(snippet);
  } else {
    // If no snippet was found, return a 404 Not Found error
    res.status(404).json({ message: `Snippet with ID ${id} not found.` });
  }
});

// POST /snippets - Create a new snippet
app.post("/snippets", (req, res) => {
  // Extract the language and code from the JSON request body
  const { language, code } = req.body;

  // Basic validation: Ensure both required fields are present in the request
  if (!language || !code) {
    return res
      .status(400)
      .json({ message: "Missing required fields: language and code" });
  }

  // Create the new snippet object
  const newSnippet = {
    // Assign the next available ID (managed globally, incremented after use)
    id: nextId++,
    language: language,
    code: code,
  };

  // Add the newly created snippet to our in-memory 'snippets' array
  snippets.push(newSnippet);

  // Respond with 201 Created status and return the newly created snippet object
  res.status(201).json(newSnippet);
});

// --- Start the Server ---
app.listen(PORT, () => {
  // Load the initial data when the server starts
  loadSeedData();
  // Log a message indicating the server is running and listening
  console.log(`Server is running on http://localhost:${PORT}`);
});
