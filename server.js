const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let snippets = [];
let nextId = 1;

function loadSeedData() {
  try {
    const dataPath = path.join(__dirname, "data", "seedData.json");
    const seedDataRaw = fs.readFileSync(dataPath, "utf8");
    const seedSnippets = JSON.parse(seedDataRaw);

    snippets = seedSnippets;

    if (snippets.length > 0) {
      const maxId = Math.max(...snippets.map((s) => s.id));
      nextId = maxId + 1;
    } else {
      nextId = 1;
    }
    console.log(
      `Loaded ${snippets.length} snippets from seed data. Next ID will be ${nextId}.`,
    );
  } catch (error) {
    console.error("Could not load seed data:", error);
    snippets = [];
    nextId = 1;
  }
}

app.get("/", (req, res) => {
  res.send("Welcome to the Snippr API!");
});

app.get("/snippets", (req, res) => {
  const language = req.query.lang;

  if (language) {
    const filteredSnippets = snippets.filter(
      (snippet) => snippet.language.toLowerCase() === language.toLowerCase(),
    );
    res.status(200).json(filteredSnippets);
  } else {
    res.status(200).json(snippets);
  }
});

app.get("/snippets/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const snippet = snippets.find((s) => s.id === id);

  if (snippet) {
    res.status(200).json(snippet);
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
    id: nextId++,
    language: language,
    code: code,
  };

  snippets.push(newSnippet);
  res.status(201).json(newSnippet);
});

app.listen(PORT, () => {
  loadSeedData();
  console.log(`Server is running on http://localhost:${PORT}`);
});
