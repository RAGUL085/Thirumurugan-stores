const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const dotenv = require('dotenv').config()
const Stripe = require('stripe')
const app = express()
app.use(cors())

app.use(express.json({limit : "10mb"}))

const PORT = process.env.PORT || 8080

//mongodb connection
console.log(process.env.MONGODB_URL)
mongoose.set('strictQuery' , false)
mongoose.connect(process.env.MONGODB_URL)
.then(() => console.log("Connected to database"))
.catch((err) => console.log(err))

//schema
const userSchema = mongoose.Schema({
    firstName : String,
    lastName : String,
    email : {
        type: String,
        unique : true
    },
    password : String,
    confirmPassword : String,
    image : String
})

//model
const userModel = mongoose.model("user", userSchema)


// Order schema
const orderSchema = mongoose.Schema({
    user: { type: String , ref: 'user' },
    products: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product' },
            name: String,
            quantity: Number,
            price: Number
        }
    ],
    totalPrice: Number,
    paymentStatus: { type: String, default: 'pending' } // Added payment status field
});

const orderModel = mongoose.model("order", orderSchema);

app.post("/store-cart-items", async (req, res) => {
    const { userEmail, userName, cartItems } = req.body;

    try {
        
        const totalPrice = cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

       
        const products = cartItems.map(item => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            price: item.price
        }));

        // Create a new order document
        const newOrder = new orderModel({
            user: userEmail, 
            products: products,
            totalPrice: totalPrice,
            paymentStatus: 'pending' 
        });

        // Save the order to the database
        await newOrder.save();

        res.status(200).json({ message: 'Cart items stored with payment success status.' });
    } catch (error) {
        console.error('Error storing cart items:', error);
        res.status(500).json({ error: 'Failed to store cart items.' });
    }
});

// Route to update payment status of the recent order for the user
app.post("/update-payment-status", async (req, res) => {
    const { userEmail } = req.body;

    try {
        // Find the most recent order for the user with the provided email
        console.log(userEmail);
        const recentOrder = await orderModel.findOne({ user: userEmail }).sort({ _id: -1 });
        console.log(recentOrder);
        if (!recentOrder) {
            return res.status(404).json({ error: 'No recent order found for the user.' });
        }
         
        // Update the payment status of the recent order to 'success'
        recentOrder.paymentStatus = 'success';
        await recentOrder.save();

        res.status(200).json({ message: 'Payment status updated successfully.' });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ error: 'Failed to update payment status.' });
    }
});


//api

app.get("/" , (req, res) =>{
    res.send("Server is running")
})

//signup api
app.post("/signup", async(req, res)=>{
    console.log(req.body)
    const {email} = req.body


    try{
        const result = await userModel.findOne({email : email})

        console.log(result)

        if(result){
            res.send({message : "Email id is already registered", alert : false})
        }
        else{
            const data = userModel(req.body)
            const save = await data.save()
            res.send({message : "Successfully signed up", alert: true})
        }
    }
    catch(err){
        console.log(err)
    }
})

app.post("/login", async (req, res) => {
    console.log(req.body);
    const { email, password } = req.body;
    try {
        const user = await userModel.findOne({ email: email });
        if (user) {
            // Compare provided password with password stored in the database
            if (password === user.password) {
                // Passwords match, user authenticated
                const userData = {
                    _id: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    image: user.image,
                    password: user.password
                };
                console.log(userData);
                res.send({ message: "Successfully logged in", alert: true, data: userData });
            } else {
                // Passwords do not match
                res.send({ message: "Incorrect email or password", alert: false });
            }
        } else {
            // User not found
            res.send({ message: "Email not registered! Please sign up.", alert: false });
        }
    } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Internal server error" });
    }
});

// product section
const productSchema = mongoose.Schema({
    name : String,
    category : String,
    image : String,
    price : Number,
    description : String,
})

const productModel = mongoose.model("product", productSchema)

// save product in database
// api
app.post("/uploadProduct", async(req, res) =>{
    console.log(req.body)
    const data = await productModel(req.body)
    const dataSave = await data.save()

    res.send({message : "Added"})
})

// 
app.get("/product", async(req, res) =>{
    const data = await productModel.find({})
    res.send(JSON.stringify(data))
})
app.get("/users",async(req,res)=>{
    const data=await userModel.find({})
    res.send(JSON.stringify(data))
})
// Payment Gateway
// console.log(process.env.STRIPE_SECRET_KEY)

console.log(process.env.STRIPE_SECRET_KEY)


const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY)

app.post("/create-checkout-session",async(req,res)=>{

     try{
      const params = {
          submit_type : 'pay',
          mode : "payment",
          payment_method_types : ['card'],
          billing_address_collection : "auto",
          shipping_options : [{shipping_rate : "shr_1NaZ3QSGLPNiaLBBQHWElQ8P"}],
          line_items : req.body.map((item)=>{
            return{
              price_data : {
                currency : "inr",
                product_data : {
                  name : item.name,
                  // images : [item.image]
                },
                unit_amount : item.price * 100,
              },
              adjustable_quantity : {
                enabled : true,
                minimum : 1,
              },
              quantity : item.qty
            }

          }),

          success_url : `${process.env.FRONTEND_URL}/success`,
          cancel_url : `${process.env.FRONTEND_URL}/cancel`,

      }

      
      const session = await stripe.checkout.sessions.create(params)
    //   console.log(session)
      res.status(200).json(session.id)

      
     }
     catch (err){
        res.status(err.statusCode || 500).json(err.message)
     }

})
//////////////////////////
// Add these routes to your Express app



app.delete("/users/:id", async (req, res) => {
    const email = req.params.email;
    try {
        await userModel.findOneAndDelete({ email: email });
        res.send("User deleted successfully");
        console.log("User deleted successfully");
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send("Internal server error");
    }
});
app.delete("/product/:id", async (req, res) => {
    const productId = req.params.id;
    try {
        await productModel.findByIdAndDelete(productId);
        res.send("Product deleted successfully");
        console.log("Product deleted successfully");
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).send("Internal server error");
    }
});




// Endpoint to update a product
app.patch("/product/:id", async (req, res) => {
    const productId = req.params.id;
    const updatedFields = req.body;

    try {
        const updatedProduct = await productModel.findByIdAndUpdate(productId, updatedFields, { new: true });
        res.send(updatedProduct);
    } catch (err) {
        console.error("Error updating product:", err);
        res.status(500).send("Internal server error");
    }
});
app.patch("/users/:id",async(req,res)=>{
    const userId=req.params.id;
    const updatedFields=req.body;
    try{
        const updateUser=await userModel.findByIdAndUpdate(userId,updatedFields,{new:true});
        res.send(updateUser);
    }
    catch(err){
        console.error("Error in updating the details");
        res.status(500).send("Internal server error");
    }
})


// Route to fetch orders
app.get('/orders', async (req, res) => {
    try {
        // Fetch all orders from the database
        const orders = await orderModel.find({});
        res.status(200).json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders.' });
    }
});


// Route to delete an order by ID
app.delete('/orders/:id', async (req, res) => {
    const orderId = req.params.id;
    try {
        // Find the order by ID and delete it
        await orderModel.findByIdAndDelete(orderId);
        res.status(200).json({ message: 'Order deleted successfully.' });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Failed to delete order.' });
    }
});



app.listen(PORT, () => console.log("Server is running at port : " + PORT))