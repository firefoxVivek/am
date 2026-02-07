import admin from "../../../config/firebase.js";
import BlockBase from "../../models/story/block.model.js";
import Story from "../../models/story/masterStory.model.js";

export const createStory = async (req, res) => {
  try {
    const userId = req.user._id; // ✅ FROM JWT
    const { title, image, blocks } = req.body;

    if (!title) {
      return res.status(400).json({
        message: "title is required",
      });
    }

    // Map blocks using discriminators
    const mappedBlocks = blocks?.map((block) => {
      const BlockModel = BlockBase.discriminators?.[block.type];
      if (!BlockModel) {
        throw new Error(`Invalid block type: ${block.type}`);
      }
      return new BlockModel(block);
    });

    const story = new Story({
      title,
      userId,
      ...(image && { image }),
      blocks: mappedBlocks || [],
    });

    const savedStory = await story.save();

    /* ----------------------------------
       🔔 SEND FCM TO USER TOPIC
       Friends are already subscribed
    ---------------------------------- */

    const topic = `user_${userId}`;

    // Fire-and-forget (never block API response)
    admin.messaging().send({
      topic,
      notification: {
        title: "New Story Posted 📖",
        body: `${req.user.displayName || "Your friend"} posted a new story`,
      },
      data: {
        type: "NEW_STORY",
        storyId: savedStory._id.toString(),
        userId: userId.toString(),
      },
    }).catch((err) => {
      console.error("FCM topic send failed:", err.message);
    });

    return res.status(201).json({ data: savedStory });
  } catch (err) {
    console.error(err);

    if (err.code === 11000) {
      return res.status(409).json({
        message: "Duplicate story detected for this user.",
      });
    }

    return res.status(500).json({ message: err.message });
  }
};


 
export const getStoryByStoryId = async (req, res) => {
  try {
    const { topicId } = req.params;

    const story = await Story.findOne({ topicId });
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    res.status(200).json({ data: story });
  } catch (error) {
    console.error("Get story error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
export const getStoryByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [stories, total] = await Promise.all([
      Story.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("title image createdAt userId")
        .populate("userId", "username"), // 👈 get username
      Story.countDocuments({ userId }),
    ]);

    if (!stories.length) {
      return res.status(404).json({ message: "No stories found" });
    }

    const result = stories.map((story) => ({
      storyId: story._id,
      title: story.title,
      image: story.image || null,
      createdAt: story.createdAt,
      userId: story.userId?._id,
      username: story.userId?.username,
    }));

    res.status(200).json({
      data: result,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get user stories error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


 
export const updateStory = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { title, authorId, blocks } = req.body;

    const updatedStory = await Story.findOneAndUpdate(
      { topicId },
      { title, authorId, blocks },
      { new: true, runValidators: true }
    );

    if (!updatedStory) {
      return res.status(404).json({ message: "Story not found" });
    }

    res.status(200).json(updatedStory);
  } catch (error) {
    console.error("Update story error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
export const getStoryById = async (req, res) => {
  try {
    const { storyId } = req.params;

    if (!storyId) {
      return res.status(400).json({ message: "storyId is required" });
    }

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    res.status(200).json({ data: story });
  } catch (error) {
    console.error("Get story by id error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid storyId" });
    }

    res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH a story (partial update)
export const patchStory = async (req, res) => {
  try {
    const { topicId } = req.params;
    const updateData = req.body; // could be partial (title, blocks, etc.)

    const patchedStory = await Story.findOneAndUpdate(
      { topicId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!patchedStory) {
      return res.status(404).json({ message: "Story not found" });
    }

    res.status(200).json(patchedStory);
  } catch (error) {
    console.error("Patch story error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// DELETE a story by topicId
export const deleteStory = async (req, res) => {
  try {
    const { topicId } = req.params;

    const deletedStory = await Story.findOneAndDelete({ topicId });
    if (!deletedStory) {
      return res.status(404).json({ message: "Story not found" });
    }

    res.status(200).json({ message: "Story deleted successfully" });
  } catch (error) {
    console.error("Delete story error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
