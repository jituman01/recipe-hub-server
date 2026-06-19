const dns = require('node:dns');
dns.setServers(['1.1.1.1', '1.0.0.1']); 

const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
dontenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {

  const authHeader = req.headers.authorization;
  // console.log(authHeader);
  

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ msg: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  // console.log(token);
  

  if (!token) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    // console.log(payload);

    next()
    
  } catch (error) {
    // console.log(error);
    return res.status(401).json({ msg: "Unauthorized" });
  }
};

const userVerify = async (req, res, next) => {
  const user = req.user;
  // console.log('user from userverify', user);
  if (user.role !== "user" || user.plan != "pro") {
    return res.status(403).json({ msg: "Forbidden" });
  }
  next()
  
}


async function run() {
  try {
    await client.connect();
    const db = client.db("recipehub-db");
    const subscriptionCollection = db.collection("subscriptions");
    const userCollection = db.collection('user');
    const recipeCollection = db.collection('recipes');


    app.post("/subscription", async (req, res) => {
      const { sessionId, userId, priceId } = req.body;
      await subscriptionCollection.insertOne({
        sessionId,
        userId,
        priceId
      })

      //update user role
      await userCollection.updateOne(
        { _id: ObjectId(userId) },
        { $set: { role: "pro" } }
      );

      res,json({msg: "Payment Successful !"})


    })


    app.post('/user/recipes', verifyToken,userVerify, async (req, res) => {
      const data = req.body;
      const result = await recipeCollection.insertOne({...data, userId:req.user.id});
      res.send(result);
    })





    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
