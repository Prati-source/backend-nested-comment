import fastify from "fastify";
import sensible from "@fastify/sensible";
import dotenv from "dotenv";
import cookie from "@fastify/cookie";
import CryptoJS  from "crypto-js";
import cors from "@fastify/cors";
import { PrismaClient } from './generated/client/index.js';
import jwt from '@fastify/jwt'



dotenv.config();

const app = fastify();

app.register(sensible); 
app.register(cookie, { secret: process.env.COOKIE_SECRET})
if ( process.env.PROCESS === 'development')
    {
        app.register(cors, { 
            origin: process.env.DEVELOPMENT_URL ,
            credentials: true
        })
    }
else{
    app.register(cors, { 
        origin: process.env.CLIENT_URL ,
        credentials: true
    })
}

app.register(jwt, {
    secret: process.env.JWT_SECRET,
    sign: {
      expiresIn: '1d',
      algorithm:'HS256' // expires in 1 hour
    },
    verify:{
        expiresIn:'1d',
        algorithms:'HS256'
    }
  });
const prisma = new PrismaClient()
const COMMENT_SELECT_FIELDS =  {
    id: true,
    message: true,
    parentId: true,
    createdAt: true,
    user:{
        select:{
            id: true,
            name: true
        }
    }
}
app.addHook("onRequest", (req,res, done) => {
   
    if(req.cookies.name === undefined){
        res.setCookie("name","anonymous",{path:'/',secure:true,sameSite:"none",secret:true,maxAge:8640000})
    }
    done()

})

app.get("/home", async(req,res)=>{
    return  res.send('everything is nonsense')
})


app.get("/posts", async (req, res) => {
    
    return await commitDb( prisma.post.findMany({select: {
        id: true,
        title: true,
       
    }})
 
                                                                                                                                          
    )
})

app.post("/postcreate", async (req,res) => {
    
    if(req.body.postbody === "" || req.body.postbody == null || req.body.title ==="" || req.body.title === null){
        return res.send(app.httpErrors.badRequest("Post body and title is required"))
    }
    try{
        const decode= app.jwt.verify(req.body.token)
        console.log(decode)
        prisma.$connect()
        return await commitDb( prisma.post.create({
        data: {
            body: req.body.postbody,
            title: req.body.title,
            authorId: decode.User.id,
        },
        select: {
            id:true,
            title:true,
            body:true,
            author:{
                select:{
                    id:true,
                    name:true,
                }
            }   
        }
    }))
    }
    catch(err){
        res.clearCookie()
        return res.send({error:'Invalid'})
    }
})

app.get("/logout",  async(req,res)=>{
   
    res.clearCookie("name")
    res.clearCookie("token")
    return  res.send({'signed':'Logged out'})
})

app.get("/expense", async(req,res)=>{
    prisma.$connect()
    const decode= app.jwt.verify(req.cookies.token)
    if(await commitDb(prisma.user.findUnique({
        where:{
            id: decode.User.id
        }})))
           {
            return await commitDb(prisma.expense.findMany({where: {
                employeeId: decode.User.id
            }}, {select: {
                id: true,
                description:true,
                category:true,
                Status: true,
                location:true,
                client:true,
                paymentMethod: true,
                amount:true,
                taxAmount:true,
                createdAt:true
                }   }))
           }
        
    else
        prisma.$disconnect()
        return res.send(app.httpErrors.badGateway("Invalid expense of user"))
})

app.post("/expensecreate/add", async(req,res)=>{

    const decode= app.jwt.verify(req.body.token)
    prisma.$connect()
    if(req.cookies.name !== "anonymous") 
        { 
            return  await commitDb(prisma.expense.create({
            data: {
                category:req.body.category,
                description: req.body.description,
                client: req.body.client,
                paymentMethod: req.body.payMeth,
                Status: req.body.status,
                location: req.body.location,
                amount: req.body.amount,
                taxAmount: req.body.taxAmt,
                employeeId: decode.User.id,
            }
        }))}
    else
        prisma.$disconnect()
        return res.send(app.httpErrors.badRequest("data is corrupted"))
})

app.get("/posts/own", async (req,res)=>{
    try{
        const decode= app.jwt.verify(req.cookies.token)
        prisma.$connect()
        return  commitDb(prisma.post.findMany({
            where:{
                authorId:decode.User.id
            },
            select:{
                id:true,
                title:true,
                body:true
            }
        }))
    }catch(err){
        res.send({errro:"Have not Created any Posts"})
    }
})


app.delete("/posts/:id", async (req,res) =>{
    try{
        const decode = app.jwt.verify(req.body.token)
        prisma.$connect()
        return await commitDb(prisma.post.delete({
            where:  {
                authorId: decode.User.id,
                id: req.params.id
            },select:{
                id:true
            }

        }))
    }catch(err){
        res.send({error:"Cannot Delete Wrong User"})
    }
})


app.get("/posts/:id", async (req, res) => {
    
    return await commitDb( prisma.post.findUnique({where: {
        id: req.params.id   
        
    }, select:{title: true, body: true, comment: {
        orderBy: {
            createdAt: "desc"
        },
        select: {
                    ...COMMENT_SELECT_FIELDS,
                    _count: { select: { likes: true}}
                
            }
        
    }}})
 
                                                                                                                                          
    ).then(async post => {
        if(req.cookies.name !== 'anonymous'){
        const likes = await prisma.Like.findMany({
            where: {userId: req.cookies.userId ,
                commentId: { in: post.comment.map(comment => comment.id)}}
        })
        

        return {
            ...post,
            comment: post.comment.map(comment => {
                const { _count, ...commentFields} = comment
                return {
                    ...commentFields,
                    likedByMe: likes.find(like => like.commentId === comment.id),
                    likeCount: _count.likes

                }

            })
        }
    }
        else{
            return post
        }        
} )
})


app.post("/posts/:id/comments", async (req, res) => {
    
    if(req.body.message === "" || req.body.message == null){
        return res.send(app.httpErrors.badRequest("Message is required"))
    }
       try {
         const decode= app.jwt.verify(req.body.token)
         prisma.$connect()
         return await   commitDb( prisma.comment.create({
                 data: {
                     message: req.body.message,
                     parentId: req.body.parentId,
                     postId: req.body.postId,
                     userId: decode.User.id,
                 
                 },
                 select: COMMENT_SELECT_FIELDS,
                
 
              
             })).then(
                 comment => {
                     return {
                         ...comment,
                         likeCount: 0,
                         likedByMe: false
                     }
                 }
             )
       } catch (error) {
            res.send({"error":error.code})
       }
        prisma.$disconnect()
    
 
                                                                                                                                          
    
})


app.put("/posts/:id/comments/:commentId", async (req,res) => {
    if(req.body.message ==="" || req.body.message === null){
        return res.send(app.httpErrors.badRequest("Messsage is required"))
    }
    const decode= app.jwt.verify(req.body.token)
    prisma.$connect()
    const { userId } = await prisma.comment.findUnique({
        where: {id: req.params.commentId},
        select: {userId: true}
    })
    if(userId !== decode.User.id){
        return res.send(app.httpErrors.unauthorized("You do not have permission to edit this message"))
    }
    return await commitDb(prisma.comment.update({
        where: {id: req.params.commentId},
        data:{
            message: req.body.message,
        

        },
        select: { message: true, id: true}
    }))
    
})


app.delete("/posts/:id/comments/:commentId", async (req,res) => {
    
    prisma.$connect()
    const { userId } = await prisma.comment.findUnique({
        where: {id: req.params.commentId},
        select: {userId: true}
    })
    if(userId !== req.cookies.userId){
        return res.send(app.httpErrors.unauthorized("You do not have permission to delete this message"))
    }
    return await commitDb(prisma.comment.delete({
        where: {id: req.params.commentId},
        select: {id:true}
        
        
    }))
    
})

app.post("/posts/:id/comments/:commentId/togglelike", async(req, res)=> {
    prisma.$connect()
    const data ={
        commentId: req.params.commentId,
        userId: req.cookies.userId,

    }

    const like = await prisma.like.findFirst({
        where:{
            userId: data.userId ,
            commentId: data.commentId
        }
    })

    if(like == null){
        return await commitDb(prisma.like.create({
            data    
        }).then(() => {
                return {addlike: true}
        }))
    }else{
        return await commitDb(prisma.like.deleteMany({
         where: 
           {
            userId: data.userId,
            commentId: data.commentId
           }
         
        }).then(() => {
                return {addlike: false}
        }))

    }

})
app.post("/melting",async (req,res)=>{
    try{
    const decode= app.jwt.verify(req.cookies.token)
    console.log(req.body)
    prisma.$connect()
    return await   commitDb(prisma.melting.create({
        data:{
            Purpose: req.body.melt.purpose,
            Ghatti_wgt: req.body.melt.ghatti,
            Pure_wgt:   req.body.melt.pure,
            Chura_wgt:  req.body.melt.chura,
            Melted_wgt: req.body.melt.melted,
            Remark: req.body.melt.remark,
            userId: decode.User.id
        },select:{
            Purpose:true
        }
    }))
    }catch(err){
        res.send({error:"error format"})
    }
})

app.post("/register", async (req, res) => {
    
    if(req.body.password === "" || req.body.password == null){
        return res.send(app.httpErrors.badRequest("password is required"))
    }
        
        prisma.$connect()
        let User = await   commitDb( prisma.user.create({
            data: {
                name: req.body.username,
                password: CryptoJS.SHA256(req.body.password).toString(),
            
            },
            select: {
                name: true,
                password: true,
                id: true,
            },
            

         
        }))
        return User

           
        prisma.$disconnect()
    
 
                                                                                                                                         
    
})

app.post("/login", async (req, res, done) => {
    
    if(req.body.password === "" || req.body.password == null){
        return res.send(app.httpErrors.badRequest("password is required"))
    }
        
        prisma.$connect()
        let User = await   commitDb( prisma.user.findFirst({
               where: {
                name: req.body.username

               },
               select:{
                id:true,
                name:true,
                password:true,

               }

        }))
        const token = app.jwt.sign({User})
        if(User.password === CryptoJS.SHA256(req.body.password).toString()){
            if(req.body.remember === true){
                res.setCookie("token",token,{maxAge: 86400000,secure:true,sameSite:'none',path:'/'})//10 Days
            }else{
            res.setCookie("token",token,{  maxAge: 8640000,secure:true,sameSite:'none',path:'/' })//1 Day
            }
            res.setCookie("name",User.name,{path:'/',secure:true,sameSite:'none',maxAge:8640000})
           return res.send({'signed':'Logedd In','token':token,'name':req.body.username})
            
                   
                    

        }
        else{
            return res.send({'error':'Incorrect Password'})
        }


           
        prisma.$disconnect()
    
 
                                                                                                                                          
    
})

app.post("/client/create",async    (req,res)=>{
    try{
        const decode= app.jwt.verify(req.body.token)
        prisma.$connect()
        if(await   commitDb(prisma.customer.findUnique({
            where:{
                name:   req.body.client.name,
                type:   req.body.client.type
            }
        }))){
            return  res.send({error:"Cannot set Client name as it is altrady occupied"})
        }
        return await   commitDb(prisma.customer.create({
            data:{
                name:req.body.client.name,
                type:   req.body.client.type,
                Part:   req.body.client.part,
                Balance: 0,
                userId:decode.User.id
            },select:{
                name:true
            }
        }))
        }catch(err){
            res.send({error:"error format"})
        }
})

app.post("/client/get",async    (req,res)=>{
    try{
        
        const decode= app.jwt.verify(req.body.token)
        if(req.body.type !== ""){ 
        prisma.$connect()
        return await   commitDb(prisma.customer.findMany({
            where:{
                type:   req.body.type,
                userId: decode.User.id
            },select:{
                name:true,
                id:true,
                Balance:true
            }
        }))}
        }catch(err){
            res.send({error:"error format"})
        }
})

app.post("/client/item",    async   (req,res)=>{
    try{
        const decode= app.jwt.verify(req.body.token)
        prisma.$connect()
         await   commitDb(prisma.item.create({
            data:{
                name:   req.body.item.name,
                type:   req.body.item.type,
                Item_wgt:   req.body.item.gross,
                Pure_wgt:   req.body.item.pure,
                Touch:  req.body.item.touch,
                Testing_wgt:req.body.item.test,
                Return_wgt:     req.body.item.return,
                Remark: req.body.item.remark,
                customerId: req.body.item.customerId

            }
            
        }))
        if(req.body.item.type === 'Customer')
        {
        return  await   commitDb(prisma.customer.update({
            where:{id:req.body.item.customerId},
            data:{
                Balance:{
                    increment:req.body.item.pure
                }
            },
            select:{
                Balance:true
            }
        }))}
        if(req.body.item.type === "Supplier"){
            return  await   commitDb(prisma.customer.update({
                where:{id:req.body.item.customerId},
                data:{
                    Balance:{
                        increment:req.body.item.pure
                    }
                },select:{
                    Balance:true
                }
            }))
        }
        }catch(err){
            res.send({error:err})
        }
})

app.post("/client/item/get",async    (req,res)=>{
    try{
        const decode= app.jwt.verify(req.body.token)
        prisma.$connect()
        return await   commitDb(prisma.user.findUnique({
            where:{
                id:decode.User.id
            },
            select:{
                customer:{
                    select:{
                        name:true,
                        item:true
                    }
                }
            }
        }))
       
    }catch(error){
        res.send({'error':error})
    }
})

app.post("/client/collection/create",async(req,res)=>{
    try{
        const decode= app.jwt.verify(req.body.token)
        prisma.$connect()
         await   commitDb(prisma.collection.create({
            data:{
                type:   req.body.collection.type,
                Ghatti_wgt:   req.body.collection.gross,
                Pure_wgt:   req.body.collection.pure,
                Remark: req.body.collection.remark,
                customerId: req.body.collection.customerId

            }
            
        }))
        if(req.body.collection.type === 'Customer')
        {
        return  await   commitDb(prisma.customer.update({
            where:{id:req.body.collection.customerId},
            data:{
                Balance:{
                    decrement:req.body.collection.pure
                }
            },
            select:{
                Balance:true
            }
        }))}
        if(req.body.collection.type === "Supplier"){
            return  await   commitDb(prisma.customer.update({
                where:{id:req.body.collection.customerId},
                data:{
                    Balance:{
                        decrement:req.body.collection.pure
                    }
                },select:{
                    Balance:true
                }
            }))
        }
        }catch(err){
            res.send({error:err})
        }
})

app.post("/client/collection/get",  async (req,res)=>{
    try{
        const decode= app.jwt.verify(req.body.token)
        prisma.$connect()
        return await   commitDb(prisma.user.findUnique({
            where:{
                id:decode.User.id
            },
            select:{
                customer:{
                    select:{
                        name:true,
                        collection:true
                    }
                }
            }
        }))
       
    }catch(error){
        res.send({'error':error})
    }
})


async function commitDb(promise) {
    const [error,data] = await app.to(promise)
    
    if (error) 
        return  ( app.httpErrors.internalServerError(error))
        return data
}

app .listen({port: process.env.PORT || '3000', host: process.env.HOST || '0.0.0.0'})


