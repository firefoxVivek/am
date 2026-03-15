import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// ─── Middleware ───────────────────────────────────────────────────────────────
import errorHandler from "./middleware/error.middleware.js";

// ─── Story Block Types (discriminator registration) ──────────────────────────
import { ParagraphBlock } from "./models/story/supporterTypes/paragraph.model.js";
import { HeadingBlock }   from "./models/story/supporterTypes/heading.model.js";
import { PoetryBlock }    from "./models/story/supporterTypes/poetry.model.js";
import { TableBlock }     from "./models/story/supporterTypes/table.model.js";
import { TimelineBlock }  from "./models/story/supporterTypes/timeliner.model.js";
import { SidenoteBlock }  from "./models/story/supporterTypes/sidenotes.model.js";
import { ListBlock }      from "./models/story/supporterTypes/list.model.js";
import { DividerBlock }   from "./models/story/supporterTypes/divider.model.js";
import { QuoteBlock }     from "./models/story/supporterTypes/quote.model.js";
import { ImageBloc }      from "./models/story/supporterTypes/image.model.js";
import { MCQBlock }       from "./models/story/supporterTypes/mcqs.model.js";

// ─── Routes — Auth & Profile ──────────────────────────────────────────────────
import userRouter                               from "./routes/profile/user.routes.js";
import profileRouter                            from "./routes/profile/profile.routes.js";
import { publicProfileRouter, freelancerRoutes} from "./routes/profile/publicProfile.routes.js";

// ─── Routes — Connections ─────────────────────────────────────────────────────
import connectionsRouter   from "./routes/connections/userToUser.route.js";
import membershipRouter    from "./routes/connections/userToClub.route.js";
import conversationsRouter from "./routes/connections/conversation.route.js";
import messagesRouter      from "./routes/connections/message.route.js";

// ─── Routes — Clubs ───────────────────────────────────────────────────────────
import clubRouter      from "./routes/clubs/club.routes.js";
import clubPostsRouter from "./routes/clubs/clubposts.route.js";
import councilRouter   from "./routes/clubs/council.routes.js";

// ─── Routes — Events ─────────────────────────────────────────────────────────
import eventsRouter        from "./routes/events/events.route.js";
import activityRouter      from "./routes/events/activity/activity.routes.js";
import participationRouter from "./routes/events/activity/participation.route.js";

// ─── Routes — Institution ─────────────────────────────────────────────────────
import institutionProfileRouter from "./routes/institution/profile.routes.js";
import institutionServicesRouter from "./routes/institution/services.routes.js";
import institutionBookingRouter  from "./routes/institution/booking.routes.js";
import cartRouter                from "./routes/institution/cart.routes.js";

// ─── Routes — Misc ────────────────────────────────────────────────────────────
import storyRouter      from "./routes/notesStory/story.routes.js";
import uploadRouter     from "./routes/others/upload.routes.js";
import locationRouter   from "./routes/others/location.routes.js";
import categoriesRouter from "./routes/others/categories.routes.js";
import requestRouter    from "./routes/request/requestCenter.routes.js";

// ─── Routes — Sponsorship & Feed ─────────────────────────────────────────────
import sponsorshipRouter from "./routes/sponsorship/sponsorship.routes.js";
import feedRouter        from "./routes/feed.routes.js";

// ─────────────────────────────────────────────────────────────────────────────

const app = express();

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(cors({ origin: "*", credentials: false }));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// ─── Auth & Profile ───────────────────────────────────────────────────────────
app.use("/api/v1/auth",              userRouter);
app.use("/api/v1/profile",           profileRouter);
app.use("/api/v1/profile/public",    publicProfileRouter);
app.use("/api/v1/freelancers",       freelancerRoutes);

// ─── Connections ──────────────────────────────────────────────────────────────
app.use("/api/v1/connections",       connectionsRouter);
app.use("/api/v1/membership",        membershipRouter);
app.use("/api/v1/conversations",     conversationsRouter);
app.use("/api/v1/messages",          messagesRouter);

// ─── Clubs ────────────────────────────────────────────────────────────────────
app.use("/api/v1/clubs",             clubRouter);
app.use("/api/v1/clubs/posts",       clubPostsRouter);
app.use("/api/v1/councils",          councilRouter);

// ─── Events ───────────────────────────────────────────────────────────────────
app.use("/api/v1/events",            eventsRouter);
app.use("/api/v1/events/activities", activityRouter);
app.use("/api/v1/events/participation", participationRouter);

// ─── Institution ──────────────────────────────────────────────────────────────
app.use("/api/v1/institutions",      institutionProfileRouter);
app.use("/api/v1/institutions/services", institutionServicesRouter);
app.use("/api/v1/institutions/bookings", institutionBookingRouter);
app.use("/api/v1/cart",              cartRouter);

// ─── Stories, Uploads, Location, Categories ───────────────────────────────────
app.use("/api/v1/stories",           storyRouter);
app.use("/api/v1/uploads",           uploadRouter);
app.use("/api/v1/location",          locationRouter);
app.use("/api/v1/categories",        categoriesRouter);

// ─── Request Center ───────────────────────────────────────────────────────────
app.use("/api/v1/requests",          requestRouter);

// ─── Sponsorship & Feed ───────────────────────────────────────────────────────
app.use("/api/v1/sponsorships",      sponsorshipRouter);
app.use("/api/v1/feed",              feedRouter);

// ─── Global Error Handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

export { app };