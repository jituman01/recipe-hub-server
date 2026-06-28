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


// async function run() {
//   try {
//     await client.connect();
client.connect(() => {
  console.log('Connecting to MongoDb');
  
}).catch(console.dir)


    const db = client.db("recipehub-db");
    const subscriptionCollection = db.collection("subscriptions");
    const userCollection = db.collection('user');
    const recipeCollection = db.collection('recipes');
    const paymentCollection = db.collection('payment');
    const favoriteCollection = db.collection("favorites");
    const reportCollection = db.collection("reports");
    const likesCollection = db.collection("likes");


    

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
    likesCount: 0,
    createdAt: new Date() 
    });
  
    res.send(result);
    });
    
    app.get('/recipes', async (req, res) => {
    const { page = 1, limit = 9, search, category } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const query = {};
    
    if (search && search !== "undefined") {
      query.$or = [
        { recipeName: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }
    if (category && category !== "undefined") {
      query.category = category;
    }

    const result = await recipeCollection.find(query).skip(skip).limit(Number(limit)).toArray();

    const totalData = await recipeCollection.countDocuments(query);
    const totalPage = Math.ceil(totalData / Number(limit));
    // console.log(totalData,totalPage);
    
    
    res.send({data: result, page: Number(page),totalPage,totalData
    });

});




    app.get('/user/overview', async (req, res) => {
    const userId = req.query.userId; 

    if (!userId) {
      return res.status(400).json({ success: false, msg: "User ID is required!" });
    }

    const query = { userId: userId };
    const totalRecipes = await recipeCollection.countDocuments(query);
    const totalFavorites = await favoriteCollection.countDocuments(query);
    
    // console.log(userId);
    const recipes = await recipeCollection.find(query).toArray();
    const totalLikesReceived = recipes.reduce((sum, recipe) => sum + (recipe.likesCount || 0), 0);

    res.status(200).json({
      success: true,
      stats: {
        totalRecipes: totalRecipes,
        totalFavorites: totalFavorites,
        totalLikesReceived: totalLikesReceived
      }
    });

  
  });


    

    app.get("/recipes", async (req, res) => {
  const { search, category } = req.query;
  const query = {};

  // Search logic
  if (search && search !== "undefined") {
    query.$or = [
      { recipeName: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } }
    ];
  }

  // Category filter logic
  if (category && category !== "undefined") {
    query.category = category;
  }

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

    
    app.get('/user/favorites', async (req, res) => { 
    const userId = req.query.userId;
  
    const userFavorites = await favoriteCollection.find({ userId: userId }).toArray();

    const recipeId = userFavorites.map(fav => new ObjectId(fav.recipeId));

    const favoriteRecipes = await recipeCollection.find({ _id: { $in: recipeId } }).toArray();

    res.json(favoriteRecipes);

});

    

  app.post("/user/favorites", async (req, res) => {

    const { userEmail, userId, recipeId } = req.body;

    const isExist = await favoriteCollection.findOne({ userId, recipeId });
    if (isExist) {
      return res.status(400).json({ success: false, msg: "This recipe is already in your favorites!" });
    }

    const result = await favoriteCollection.insertOne({
      userEmail,
      userId,
      recipeId,
      addedAt: new Date() 
    });

    res.status(200).json({ success: true, msg: "Added to favorites successfully!", data: result });
  
});


    

    app.patch('/recipes/:id/like', async (req, res) => {
  
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };

    const updateCount = {
      $inc: { likesCount: 1 }
    };

    const result = await recipeCollection.updateOne(filter, updateCount);
    
    if (result.modifiedCount > 0) {
      const updatedRecipe = await recipeCollection.findOne(filter);

      res.status(200).json({ 
        success: true, 
        msg: "Recipe liked successfully!", 
        likesCount: updatedRecipe.likesCount || 0 
      });
    } else {
      res.status(404).json({ success: false, msg: "Recipe not found." });
    }
});


  app.delete("/favorites/remove", async (req, res) => {
    const { userId, recipeId } = req.body || req.query;
    
    const result = await db.collection("favorites").deleteOne({
      userId: userId,
      recipeId: recipeId
    });

    if (result.deletedCount > 0) {
      return res.status(200).json({ success: true, message: "Removed from favorites successfully" });
    }
  });
    

app.get('/user/check-like', async (req, res) => {
    const { userId, recipeId } = req.query;
    const isLiked = await likesCollection.findOne({ userId, recipeId });
    res.json({ isLiked: !!isLiked });
});

app.get('/user/check-favorite', async (req, res) => {
    const { userId, recipeId } = req.query;
    const isFavorited = await favoriteCollection.findOne({ userId, recipeId });
    res.json({ isFavorited: !!isFavorited });
});




  app.post("/user/reports", async (req, res) => {

    const { recipeId, recipeName, reporterEmail, reason, details } = req.body;

    if (!recipeId || !reporterEmail || !reason) {
      return res.status(400).json({ success: false, msg: "Required fields are missing!" });
    }

    const result = await reportCollection.insertOne({
      recipeId,
      recipeName,
      reporterEmail,
      reason,
      details: details || "",
      status: "pending",
      createdAt: new Date(),
    });

    res.status(200).json({ 
      success: true, 
      msg: "Recipe reported successfully!", 
      data: result 
    });

});


  app.patch("/users/:id", async (req, res) => {
        const { id } = req.params;
        const { name, photoURL } = req.body;
        const filter = { _id: new ObjectId(id) };

        const updateProfile = {
          $set: {
            name: name,
            image: photoURL,
          },
        };

        const result = await userCollection.updateOne(filter, updateProfile);

        
          return res.status(200).json({ success: true, message: "Profile updated successfully!" });
        
    });


    //-----------------Admin-----------//

    app.get("/admin/overview-stats", async (req, res) => {
        const totalUsers = await userCollection.countDocuments();
        const totalRecipes = await recipeCollection.countDocuments(); 
        const totalPremium = await userCollection.countDocuments({ plan: "pro" }); 
        const totalReports = await reportCollection.countDocuments(); 

        res.status(200).json({
          success: true,
          data: {
            totalUsers,
            totalRecipes,
            totalPremium,
            totalReports
          }
        });

        res.status(500).json({ success: false, message: "Internal Server Error" });
      
    });


    app.get("/admin/users", async (req, res) => {
       const users = await userCollection.find({}, { projection: { name: 1, email: 1, image: 1, isBlocked: 1, status: 1 } }).toArray();
        res.status(200).json({ success: true, data: users });

        res.status(500).json({ success: false, message: "Internal Server Error" });
 
    });

    app.patch("/admin/users/:id/toggle-status", async (req, res) => {
        const { id } = req.params;
        const { isBlocked } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            isBlocked: isBlocked,
            status: isBlocked ? "Blocked" : "Active"
          }
        };

        const result = await userCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount > 0) {
          res.status(200).json({ success: true, message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully!` });
        } else {
          res.status(400).json({ success: false, message: "No changes made." });
        }

        res.status(500).json({ success: false, message: "Internal Server Error" });
 
    });





    app.get("/admin/recipes", async (req, res) => {
        const recipes = await recipeCollection.find({}).toArray();
        res.status(200).json({ success: true, data: recipes });

    });



    app.delete("/admin/recipes/:id", async (req, res) => {

        const { id } = req.params;
        const result = await recipeCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount > 0) {
          res.status(200).json({ success: true, message: "Recipe deleted successfully!" });
        }


    });



    app.patch("/admin/recipes/:id/toggle-featured", async (req, res) => {
        const { id } = req.params;
        const { isFeatured } = req.body;

        const result = await recipeCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isFeatured: isFeatured } }
        );

        if (result.modifiedCount > 0) {
          res.status(200).json({ 
            success: true, 
            message: `Recipe ${isFeatured ? 'added to featured' : 'removed from featured'}!` 
          });
        }
    });




  app.get("/admin/reports", async (req, res) => {
    const reports = await reportCollection.find({}).toArray();
    res.status(200).json({ success: true, data: reports });
  });


    app.delete("/admin/reports/remove-recipe/:recipeId/:reportId", async (req, res) => {

    const { recipeId, reportId } = req.params;
    
    const recipeResult = await recipeCollection.deleteOne({ _id: new ObjectId(recipeId) });
    const reportResult = await reportCollection.deleteOne({ _id: new ObjectId(reportId) });

    res.status(200).json({ success: true, recipeResult, reportResult });

    });

  app.delete("/admin/reports/dismiss/:reportId", async (req, res) => {

    const { reportId } = req.params;
    const result = await reportCollection.deleteOne({ _id: new ObjectId(reportId) });

    if (result.deletedCount > 0) {
      res.status(200).json({ success: true, result });
    }


});

    app.get('/api/recipes/popular', async (req, res) => {
  const data = await db.collection("recipes").find({}).sort({ likesCount: -1 }).limit(6).toArray();
  
  res.send(data);
});


  app.get("/admin/transactions", async (req, res) => {

    const recipePayments = await db.collection("payment").find({}).toArray();
    const formattedRecipe = recipePayments.map(item => ({
      _id: item._id,
      userEmail: item.userEmail,
      type: "Recipe",
      amount: item.amount ? parseFloat(item.amount) : 4.99, 
      status: item.paymentStatus, 
      transactionId: item.transactionId, 
      date: item.paidAt
    }));

   
    const subscriptions = await db.collection("subscriptions").find({}).toArray();
    
    const formattedPremium = await Promise.all(
      subscriptions.map(async (item) => {
        let userEmail = "";
        let fallbackDate = new Date();

        if (item.userId) {
          try {
            const userDoc = await db.collection("user").findOne({ _id: new ObjectId(item.userId) });
            if (userDoc) {
              userEmail = userDoc.email; 
              fallbackDate = userDoc.createdAt;
            }
          } catch (err) {
            const user = await db.collection("user").findOne({ _id: item.userId });
            if (user) {
              userEmail = user.email;
              fallbackDate = user.createdAt;
            }
          }
        }

        return {
          _id: item._id,
          userEmail: userEmail,
          type: "Premium",
          amount: 9.99, 
          status: "paid",
          transactionId: item.sessionId,
          date: fallbackDate
        };
      })
    );

   
    const allTransactions = [...formattedPremium, ...formattedRecipe];
    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.status(200).json({ success: true, data: allTransactions });

  });

    app.get('/api/recipes/featured', async (req, res) => {
  const data = await db.collection("recipes").find({ isFeatured: true }).toArray();
  
  res.send(data);
});


    // await client.db("admin").command({ ping: 1 });
//     console.log(
//       "Pinged your deployment. You successfully connected to MongoDB!",
//     );
//   } finally {
//     // Ensures that the client will close when you finish/error
//     // await client.close();
//   }
// }
// run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
