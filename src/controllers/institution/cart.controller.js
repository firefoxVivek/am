import mongoose from "mongoose";
import { Cart }        from "../../models/institution/cart.model.js";
import ServiceCard     from "../../models/institution/serviceCard.model.js";
import Booking         from "../../models/institution/booking.model.js";
import { Institution } from "../../models/Profile/institution.model.js";
import { ApiError }    from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
import { notify }      from "../../utils/notify.js";

/*
 * CART CONTROLLER
 * ──────────────────────────────────────────────────────────────────
 * All operations work on a single cart document per user.
 *
 * CHECKOUT FLOW:
 *   1. User reviews cart    GET  /cart
 *   2. Set schedule per item PATCH /cart/items/:itemId
 *   3. Checkout             POST /cart/checkout
 *   4. Items grouped by provider → one Booking per provider
 *   5. Each booking gets proper lineItems array (not a text string)
 *   6. Cart cleared atomically
 *   7. All created bookings returned
 */

/* ── Helper ──────────────────────────────────────────────────────*/
function parseAmount(str) {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

/* ================================================================
   ADD ITEM TO CART
   POST /api/v1/cart/items
   Body: { cardId, itemName, quantity?, schedule?, note? }
================================================================ */
export const addToCart = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { cardId, itemName, quantity = 1, schedule, note } = req.body;

  if (!cardId)           throw new ApiError(400, "cardId is required");
  if (!itemName?.trim()) throw new ApiError(400, "itemName is required");
  if (quantity < 1 || quantity > 100) {
    throw new ApiError(400, "quantity must be between 1 and 100");
  }
  if (!mongoose.Types.ObjectId.isValid(cardId)) {
    throw new ApiError(400, "Invalid cardId");
  }

  const card = await ServiceCard.findOne({ _id: cardId, isActive: true }).lean();
  if (!card) throw new ApiError(404, "Service card not found or unavailable");

  if (card.providerId.toString() === userId.toString()) {
    throw new ApiError(400, "You cannot add your own services to cart");
  }

  // Find matching item in card for price snapshot
  const cardItem = card.itemsList?.find(
    (i) => i.name.toLowerCase() === itemName.trim().toLowerCase()
  );

  const resolvedItemName = cardItem?.name ?? itemName.trim();
  const priceSnapshot    = cardItem?.price ?? "";
  const unitAmount       = parseAmount(priceSnapshot);
  const bookingType      = card.customFields?.isVenue ? "venue" : "service";

  let cart = await Cart.findOne({ userId });
  if (!cart) cart = new Cart({ userId, items: [] });

  // If same card+item already in cart → increment quantity
  const existingIdx = cart.items.findIndex(
    (i) =>
      i.cardId.toString() === cardId &&
      i.itemName.toLowerCase() === resolvedItemName.toLowerCase()
  );

  if (existingIdx !== -1) {
    cart.items[existingIdx].quantity = Math.min(
      cart.items[existingIdx].quantity + quantity,
      100
    );
    if (schedule) cart.items[existingIdx].schedule = schedule;
    if (note)     cart.items[existingIdx].note     = note;
  } else {
    cart.items.push({
      cardId:        card._id,
      institutionId: card.institutionId,
      providerId:    card.providerId,
      cardTitle:     card.title,
      itemName:      resolvedItemName,
      priceSnapshot,
      imageUrl:      card.imageUrl ?? null,
      bookingType,
      quantity,
      unitAmount,
      schedule: schedule ?? { date: null, startTime: null, endTime: null, duration: null },
      note:     note ?? "",
    });
  }

  cart.recomputeTotal();
  await cart.save();

  return res.status(200).json(new ApiResponse(200, cart, "Item added to cart"));
});

/* ================================================================
   GET MY CART
   GET /api/v1/cart
   Returns items grouped by institution for Flutter section headers.
================================================================ */
export const getCart = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const cart   = await Cart.findOne({ userId }).lean();

  if (!cart || !cart.items.length) {
    return res.status(200).json(
      new ApiResponse(200, {
        items: [], grouped: [], totalAmount: 0, itemCount: 0,
      }, "Cart is empty")
    );
  }

  // Group by institutionId for Flutter UI (one section per provider)
  const groupMap = {};
  for (const item of cart.items) {
    const key = item.institutionId.toString();
    if (!groupMap[key]) {
      groupMap[key] = {
        institutionId: item.institutionId,
        providerId:    item.providerId,
        items:         [],
        subtotal:      0,
      };
    }
    groupMap[key].items.push(item);
    groupMap[key].subtotal += (item.unitAmount ?? 0) * (item.quantity ?? 1);
  }

  return res.status(200).json(
    new ApiResponse(200, {
      cartId:      cart._id,
      items:       cart.items,
      grouped:     Object.values(groupMap),
      totalAmount: cart.totalAmount,
      itemCount:   cart.items.length,
      expiresAt:   cart.expiresAt,
    }, "Cart fetched")
  );
});

/* ================================================================
   UPDATE CART ITEM
   PATCH /api/v1/cart/items/:itemId
   Body: { quantity?, schedule?, note? }
================================================================ */
export const updateCartItem = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { itemId } = req.params;
  const { quantity, schedule, note } = req.body;

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new ApiError(400, "Invalid item ID");
  }

  const cart = await Cart.findOne({ userId });
  if (!cart) throw new ApiError(404, "Cart not found");

  const item = cart.items.id(itemId);
  if (!item) throw new ApiError(404, "Item not found in cart");

  if (quantity !== undefined) {
    if (quantity < 1 || quantity > 100) {
      throw new ApiError(400, "quantity must be between 1 and 100");
    }
    item.quantity = quantity;
  }
  if (schedule !== undefined) item.schedule = schedule;
  if (note     !== undefined) item.note     = note.trim();

  cart.recomputeTotal();
  await cart.save();

  return res.status(200).json(new ApiResponse(200, cart, "Cart item updated"));
});

/* ================================================================
   REMOVE ITEM FROM CART
   DELETE /api/v1/cart/items/:itemId
================================================================ */
export const removeFromCart = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { itemId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new ApiError(400, "Invalid item ID");
  }

  const cart = await Cart.findOne({ userId });
  if (!cart) throw new ApiError(404, "Cart not found");

  const before = cart.items.length;
  cart.items   = cart.items.filter((i) => i._id.toString() !== itemId);

  if (cart.items.length === before) {
    throw new ApiError(404, "Item not found in cart");
  }

  cart.recomputeTotal();
  await cart.save();

  return res.status(200).json(new ApiResponse(200, cart, "Item removed"));
});

/* ================================================================
   CLEAR CART
   DELETE /api/v1/cart
================================================================ */
export const clearCart = asynchandler(async (req, res) => {
  await Cart.findOneAndUpdate(
    { userId: req.user._id },
    { $set: { items: [], totalAmount: 0 } }
  );
  return res.status(200).json(new ApiResponse(200, {}, "Cart cleared"));
});

/* ================================================================
   CHECKOUT
   POST /api/v1/cart/checkout
   Body: { schedule?, note? }

   Groups cart items by provider → one Booking per provider.
   Each booking has a proper lineItems array — structured, not text.

   VALIDATIONS BEFORE BOOKING:
   ✓ Cart is not empty
   ✓ All cards are still active
   ✓ schedule.date exists if any item is a venue type

   ATOMICITY:
   Cart is cleared AFTER all bookings are created.
   If any booking creation fails → cart is not cleared → user can retry.
================================================================ */
export const checkout = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { schedule, note = "", bookedOnBehalfOf = null } = req.body;

  const cart = await Cart.findOne({ userId }).lean();
  if (!cart || !cart.items.length) {
    throw new ApiError(400, "Your cart is empty");
  }

  // ── 0. Resolve bookedBy for B2B checkouts ────────────────────
  let bookedBy = null;

  if (bookedOnBehalfOf) {
    if (!mongoose.Types.ObjectId.isValid(bookedOnBehalfOf)) {
      throw new ApiError(400, "Invalid bookedOnBehalfOf institution ID");
    }

    const clientInstitution = await Institution.findOne({
      _id:       bookedOnBehalfOf,
      founderId: userId,
      status:    "active",
    }).select("name logo").lean();

    if (!clientInstitution) {
      throw new ApiError(
        403,
        "Institution not found or you are not the founder of this institution"
      );
    }

    bookedBy = {
      entityType: "institution",
      entityId:   clientInstitution._id,
      name:       clientInstitution.name,
      logo:       clientInstitution.logo ?? null,
    };
  }

  // ── 1. Validate all cards still active ───────────────────────
  const cardIds    = [...new Set(cart.items.map((i) => i.cardId.toString()))];
  const activeCards = await ServiceCard.find({
    _id:      { $in: cardIds },
    isActive: true,
  }).lean();

  const activeCardMap = {};
  for (const c of activeCards) activeCardMap[c._id.toString()] = c;

  const unavailable = cart.items.filter(
    (i) => !activeCardMap[i.cardId.toString()]
  );

  if (unavailable.length) {
    return res.status(409).json(
      new ApiResponse(409, {
        unavailableItems: unavailable.map((i) => ({
          itemId: i._id, itemName: i.itemName, cardId: i.cardId,
        })),
      }, "Some items are no longer available. Remove them and try again.")
    );
  }

  // ── 2. Validate venue items have a schedule ───────────────────
  const hasVenueItem  = cart.items.some((i) => i.bookingType === "venue");
  const scheduleDate  = schedule?.date ?? null;

  if (hasVenueItem && !scheduleDate) {
    throw new ApiError(422,
      "A date is required for venue bookings. Set a schedule before checking out."
    );
  }

  // ── 3. Group by providerId ────────────────────────────────────
  const providerGroups = {};
  for (const item of cart.items) {
    const key = item.providerId.toString();
    if (!providerGroups[key]) {
      providerGroups[key] = {
        providerId:    item.providerId,
        institutionId: item.institutionId,
        lineItems:     [],
        totalAmount:   0,
      };
    }

    const lineTotal = (item.unitAmount ?? 0) * (item.quantity ?? 1);

    providerGroups[key].lineItems.push({
      cardId:        item.cardId,
      cardTitle:     item.cardTitle,
      itemName:      item.itemName,
      priceSnapshot: item.priceSnapshot,
      unitAmount:    item.unitAmount,
      quantity:      item.quantity,
      lineTotal,
      bookingType:   item.bookingType,
    });

    providerGroups[key].totalAmount += lineTotal;
  }

  // ── 4. Create one Booking per provider ────────────────────────
  const bookings = await Promise.all(
    Object.values(providerGroups).map((group) =>
      Booking.create({
        userId,
        bookedBy,                  // null for personal, institution snapshot for B2B
        providerId:    group.providerId,
        institutionId: group.institutionId,
        lineItems:     group.lineItems,
        schedule:      schedule ?? { date: null, startTime: null, endTime: null, duration: null },
        note:          note.trim(),
        totalAmount:   group.totalAmount,
        status:        "pending",
        paymentStatus: "unpaid",
      })
    )
  );

  // ── 5. Notify each provider ───────────────────────────────────
  const callerName  = bookedBy?.name ?? req.user.displayName;
  const callerImage = bookedBy?.logo ?? req.user.imageUrl ?? "";

  await Promise.allSettled(
    bookings.map((booking) => {
      const summary = booking.lineItems
        .map((i) => `${i.itemName} ×${i.quantity}`)
        .join(", ")
        .slice(0, 80);

      return notify({
        recipientId: booking.providerId,
        senderId:    userId,
        type:        "NEW_BOOKING",
        title:       "New booking request",
        body:        `${callerName}: ${summary}`,
        payload: {
          screen:     "BookingDetail",
          entityId:   booking._id.toString(),
          actorId:    userId.toString(),
          actorName:  callerName,
          actorImage: callerImage,
          extra:      { institutionId: booking.institutionId.toString() },
        },
      });
    })
  );

  // ── 6. Clear cart atomically ──────────────────────────────────
  await Cart.findOneAndUpdate(
    { userId },
    { $set: { items: [], totalAmount: 0 } }
  );

  return res.status(201).json(
    new ApiResponse(201, {
      bookings,
      bookingCount: bookings.length,
    },
    `Checkout successful. ${bookings.length} booking${bookings.length > 1 ? "s" : ""} created.`
    )
  );
});