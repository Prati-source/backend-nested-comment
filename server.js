import fastify from "fastify";
import sensible from "@fastify/sensible";
import dotenv from "dotenv";
import cookie from "@fastify/cookie";
import url from "@fastify/mongodb";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
dotenv.config();


const app = fastify();
app.register({url: process.env.MONGODB_URI})
app.register(sensible); 
app.register(cookie, { secret: process.env.COOKIE_SECRET})
app.register(cors, { 
    origin: process.env.CLIENT_URL,
    credentials: true
})
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
    
    if(req.cookies.userId !== CURRENT_USER.id){
        req.cookies.userId = CURRENT_USER.id
        res.clearCookie("userId")
        res.setCookie("userId", CURRENT_USER.id)
    }
    done()

})

const CURRENT_USER = ( await  prisma.User.findFirst({ where: { name: "Kyle"}}))



app.get("/posts", async (req, res) => {
    
    return await commitDb( prisma.post.findMany({select: {
        id: true,
        title: true
    }})
 
                                                                                                                                          
    )
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
    } )
})


app.post("/posts/:id/comments", async (req, res) => {
    
    if(req.body.message === "" || req.body.message == null){
        return res.send(app.httpErrors.badRequest("Message is required"))
    }
        prisma.$connect()
        return await   commitDb( prisma.comment.create({
                data: {
                    message: req.body.message,
                    parentId: req.body.parentId,
                    postId: req.body.postId,
                    userId: req.cookies.userId,
                
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
        prisma.$disconnect()
    
 
                                                                                                                                          
    
})


app.put("/posts/:id/comments/:commentId", async (req,res) => {
    if(req.body.message ==="" || req.body.message === null){
        return res.send(app.httpErrors.badRequest("Messsage is required"))
    }
    prisma.$connect()
    const { userId } = await prisma.comment.findUnique({
        where: {id: req.params.commentId},
        select: {userId: true}
    })
    if(userId !== req.cookies.userId){
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





async function commitDb(promise) {
    const [error,data] = await app.to(promise)
    if (error) 
        return  ( app.httpErrors.internalServerError(error))
        return data
}

app.listen({port: process.env.PORT || 8080})