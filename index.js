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
  
  if (!user || user.role !== "user") {
    return res.status(403).json({ msg: "Forbidden" });
  }
  
  next();
};


async function run() {
  try {
    await client.connect();
    const db = client.db("recipehub-db");
    const subscriptionCollection = db.collection("subscriptions");
    const userCollection = db.collection('user');
    const recipeCollection = db.collection('recipes');
    const paymentCollection = db.collection('payment');

    

app.get('/user/my-recipes', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, msg: "User ID is required!" });
    }

    const query = { userId: userId };
    const result = await recipeCollection.find(query).toArray();
    res.status(200).json(result);
  } catch (error) {
    // console.error( error);
    res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
});

    app.patch('/recipes/:id', async (req, res) => {
    try {
    const id = req.params.id;
    const updatedData = req.body;
    const filter = { _id: new ObjectId(id) };
    
    const updateDoc = {
      $set: {
        title: updatedData.title,
        category: updatedData.category,
        cookingTime: updatedData.cookingTime,
        difficulty: updatedData.difficulty
      }
    };

    const result = await recipeCollection.updateOne(filter, updateDoc);
    if (result.modifiedCount > 0) {
      res.status(200).json({ success: true, msg: "Recipe updated successfully!" });
    } else {
      res.status(400).json({ success: false, msg: "No changes made or recipe not found." });
    }
  } catch (error) {
    // console.error( error);
    res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
  });


    
    app.delete('/recipes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    
    const result = await recipeCollection.deleteOne(query);
    if (result.deletedCount > 0) {
      res.status(200).json({ success: true, msg: "Recipe deleted successfully!" });
    } else {
      res.status(404).json({ success: false, msg: "Recipe not found." });
    }
  } catch (error) {
    // console.error(error);
    res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
  });



    app.post("/subscription", async (req, res) => {
      const { sessionId, userId, priceId } = req.body;

      const isExist = await subscriptionCollection.findOne({ sessionId });
      if (isExist) {
        return res.json({ msg: 'Already exist!' });
      }

      await subscriptionCollection.insertOne({
        sessionId,
        userId,
        priceId
      })

      //update user role
      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { plan: "pro" } }
      );

      res.json({ msg: "Payment Successful !" })


    });


    app.post("/payment", async (req, res) => {
    const { userEmail, userId,recipeName, image, authorName, amount, recipeId, transactionId, paymentStatus, paidAt } = req.body;

    const payment = await paymentCollection.findOne({ transactionId });
    if (payment) {
      return res.json({ msg: 'Payment already recorded!' });
    }

    await paymentCollection.insertOne({
      userEmail,
      userId,
      amount,
      recipeId,
      recipeName,
      image,
      authorName,
      transactionId,
      paymentStatus,
      paidAt
    });

      res.json({ msg: "Payment Successful !" });
    });




  app.post('/user/recipes', verifyToken, userVerify, async (req, res) => {
    const data = req.body;
    const authUserId = req.user.id;

    const user = await userCollection.findOne({ _id: new ObjectId(authUserId) });

    const recipeCount = await recipeCollection.countDocuments({ userId: authUserId });

    if (user?.plan !== "pro" && recipeCount >= 2) {
    return res.status(403).json({ 
      success: false, 
      msg: "Free limit exceeded! You can only add up to 2 recipes in the free plan. Please upgrade to Pro." 
    });
    }

    const result = await recipeCollection.insertOne({ 
    ...data, 
    userId: authUserId,
    createdAt: new Date() 
    });
  
    res.send(result);
  });




  app.get('/user/overview', async (req, res) => {
  try {
    const userId = req.query.userId; 

    if (!userId) {
      return res.status(400).json({ success: false, msg: "User ID is required!" });
    }

    const query = { userId: userId };
    const totalRecipes = await recipeCollection.countDocuments(query);
    
    // console.log(userId);

    res.status(200).json({
      success: true,
      stats: {
        totalRecipes: totalRecipes,
        totalFavorites: 0,
        totalLikesReceived: 0
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
});


    

    app.get("/recipes", async (req, res) => {
      const { search } = req.query;
      // console.log(search);
      
      const query = {};
      if (search && search != "undefined") {
        query.$or = [
          { recipeName: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ]
      };

      const result = await recipeCollection.find(query).toArray();
      res.send(result);
    });


    app.get('/recipe/:id', async (req, res) => {
      const { id } = req.params;
      const result = await recipeCollection.findOne({ _id: new ObjectId(id) });

      res.send(result);
    });



    app.get('/user/purchased-recipes', async (req, res) => {
    const userId = req.query.userId;

    const query = { userId: userId };
    const result = await paymentCollection.find(query).toArray();
    
    res.status(200).json(result);
});





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
