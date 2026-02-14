
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
app.use(
  cors({
    origin: "*",
    credentials: false,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

import userRouter from "./routes/profile/user.routes.js";
 
 
import Story from "./routes/notesStory/story.routes.js";
import Club from "./routes/clubs/club.routes.js";
import ClubPosts from "./routes/clubs/clubposts.route.js";
import errorHandler from "./middleware/error.middleware.js";

import { ParagraphBlock } from "./models/story/supporterTypes/paragraph.model.js";
import { HeadingBlock } from "./models/story/supporterTypes/heading.model.js";
import { PoetryBlock } from "./models/story/supporterTypes/poetry.model.js";
import { TableBlock } from "./models/story/supporterTypes/table.model.js";
import { TimelineBlock } from "./models/story/supporterTypes/timeliner.model.js";
import { SidenoteBlock } from "./models/story/supporterTypes/sidenotes.model.js";
import { ListBlock } from "./models/story/supporterTypes/list.model.js";
import { DividerBlock } from "./models/story/supporterTypes/divider.model.js";
import { QuoteBlock } from "./models/story/supporterTypes/quote.model.js";
import { ImageBloc } from "./models/story/supporterTypes/image.model.js";
import { MCQBlock } from "./models/story/supporterTypes/mcqs.model.js";

import Events from "./routes/events/events.route.js";
import uploadRoutes from "./routes/others/upload.routes.js";
import Activity from "./routes/events/activity/activity.routes.js";
import Participation from "./routes/events/activity/participation.route.js";
import Profile from "./routes/profile/profile.routes.js";
import PublicProfile from "./routes/profile/publicProfile.routes.js";
import Connections from "./routes/connections/userToUser.route.js";
import Membership from "./routes/connections/userToClub.route.js";
import IProfile from "./routes/institution/profile.routes.js";
import IServices from "./routes/institution/services.routes.js";
import IBooking from "./routes/institution/booking.routes.js";
import Location from "./routes/others/location.routes.js";
import Categories from "./routes/others/categories.routes.js";
import Conversations from "./routes/connections/conversation.route.js";
import messages from "./routes/connections/message.route.js";

app.use("/api/v1/auth", userRouter);
app.use("/api/v1/profile", Profile);
app.use("/api/v1/profile/public", PublicProfile );
app.use("/api/v1/club", Club);
app.use("/api/v1/club/posts", ClubPosts);
app.use("/api/v1/events",Events);
app.use("/api/v1/events/activity/",Activity);
app.use("/api/v1/events/participation/",Participation);
app.use("/api/v1/uploads", uploadRoutes);
app.use("/api/v1/connections",Connections);
app.use("/api/v1/membership",Membership);
app.use("/api/v1/stories", Story);
app.use("/api/v1/location", Location);
app.use("/api/v1/categories", Categories);
app.use("/api/v1/conversations", Conversations);
app.use("/api/v1/messages", messages);

app.use("/api/v1/institution/profile", IProfile );
app.use("/api/v1/institution/services", IServices );
app.use("/api/v1/institution/bookings", IBooking );

app.use(errorHandler);
export { app };
