import { Artist } from "../models/Artist.js";
import { isAdmin } from "../utils/authHelper.js";
import { StatusCodes } from "http-status-codes";
import { BadRequestError, UnauthorizedError } from "../errors/index.js";
import { createArtistService, updateArtistService } from "../services/artistService.js";
import { cycleToInterval } from "../utils/cycleToInterval.js";
import { fetchArtistsWithCounts, fetchArtistById } from '../services/artistService.js';
import { shapeArtistResponse } from "../dto/artist.dto.js";
import { getCached, setCached } from "../utils/redisClient.js";
import mongoose from "mongoose";

export const createArtist = async (req, res) => {
  if (!isAdmin(req.user)) throw new UnauthorizedError("Access denied. Admins only.");

  const { name, bio, location, subscriptionPrice, cycle } = req.body;
  if (!name) throw new BadRequestError("Artist name is required.");
  if (!cycle) throw new BadRequestError("Subscription cycle is required (1m, 3m, 6m, 12m).");

  const intervals = cycleToInterval(cycle);
  intervals.cycleLabel = cycle; // add label for DB

  const imageFile = req.files?.coverImage?.[0];
  const imageUrl = imageFile?.location || "";
  const basePrice = { currency: "USD", amount: subscriptionPrice }; // default base price
  const artist = await createArtistService({
    name,
    bio,
    location,
    imageUrl,
    basePrice,
    cycle: intervals,
    createdBy: req.user._id
  });

  res.status(StatusCodes.CREATED).json({ success: true, artist });
};

export const creatArtist2 = async (req, res) => {
  if(isAdmin(!req.user)) throw UnauthorizedError("Access denied. Admin Only")

    const {name, bio, subscriptionPrice, location, cycle} = req.body;

    if(!name) throw new BadRequestError("Arist name is required");
    if(!cycle) throw new BadRequestError("subscription Cycle is required")

      const imageFile = req.files?.coverImage?.[0];
      const imageUrl = imageFile?.location || "";
      const basePrice = {currency: "USD", amount : subscriptionprice}
      

}

/**
 * PATCH /api/artist/profile
 * Artist updates own profile
 */
export const updateArtistProfile = async (req, res) => {
  const artistId = req.user?.artistId;
  const userId = req.user?._id;
  if (!artistId || !mongoose.Types.ObjectId.isValid(artistId)) {
    throw new UnauthorizedError("Artist profile not linked to user");
  }
  const {
    name,
    bio,
    location,
    country,
    socials,
  } = req.body;
  // Basic structural validations
  if (socials && !Array.isArray(socials)) {
    throw new BadRequestError("Socials must be an array");
  }
  console.log(req.files.profileImage[0].location,"------")
  console.log(req.files.coverImage[0].location,"------")
  const updatedArtist = await updateArtistService({
    artistId,
    userId,
    payload: {
      name,
      bio,
      location,
      country,
      socials,
    },
    profileImageFile: req.files?.profileImage?.[0]?.location,
    coverImageFile: req.files?.coverImage?.[0]?.location,
  });
  res.status(StatusCodes.OK).json({
    success: true,
    artist: updatedArtist,
  });
};

export const deleteArtist = async (req, res) => {
  if (!isAdmin(req.user)) {
    throw new UnauthorizedError("Access denied. Admins only.");
  }

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid artist ID.");
  }

  // Hard delete (if you want cascade cleanup)
  const artist = await Artist.findByIdAndDelete(id);
  if (!artist) {
    throw new NotFoundError("Artist not found.");
  }

  // TODO: Optional cascade cleanup
  // await Song.deleteMany({ artist: id });
  // await Album.deleteMany({ artist: id });
  // await Subscription.deleteMany({ artist: id });
  // await Transaction.updateMany({ artist: id }, { status: "cancelled" });

  // TODO: Audit log (recommended for destructive ops)
  // await AuditLog.create({
  //   action: "delete_artist",
  //   actor: req.user._id,
  //   artistId: id,
  //   timestamp: new Date(),
  // });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Artist deleted successfully",
    artistId: id,
  });
};


export const getAllArtists = async (req, res) => {
  const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
  const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 10;

  const cacheKey = `artists:page=${page}:limit=${limit}`;

  try {
    // 1. Try cache first
    const cached = await getCached(cacheKey);
    if (cached) {
      return res.status(StatusCodes.OK).json(cached);
    }

    // 2. Fallback → DB
   const { artists, total } = await fetchArtistsWithCounts({
  page,
  limit,
  filter: { isMonetizationComplete: true }
});

    const shapedArtists = artists.map(shapeArtistResponse);

    const response = {
      success: true,
      artists: shapedArtists,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    // 3. Save to cache (10 min TTL)
    await setCached(cacheKey, response, 10);

    res.status(StatusCodes.OK).json(response);
  } catch (err) {
    console.error("❌ getAllArtists error:", err);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Failed to fetch artists" });
  }
};

export const getArtistById = async (req, res) => {
  const identifier = req.params.id;
  const cacheKey = `artist:${identifier}`;
  

  try {
    // 1. Try cache first
    const cached = await getCached(cacheKey);
    if (cached) return res.status(StatusCodes.OK).json(cached);

    // 2. Fetch from service
    const artist = await fetchArtistById(identifier);
    

    // 3. Shape DTO
    const shaped = shapeArtistResponse(artist);
    const response = { success: true, artist: shaped };

    // 4. Cache result for 10 min
    await setCached(cacheKey, response, 600);

    res.status(StatusCodes.OK).json(response);
  } catch (err) {
    console.error("❌ getArtistById error:", { identifier, error: err.message });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch artist",
    });
  }
};

export const getArtistProfile = async (req, res) => {
  const artistId = req.user.artistId;

  if (!artistId) {
    throw new ForbiddenError("Artist profile not found");
  }

  const artist = await Artist.findById(artistId)
    .select(`
      name
      slug
      profileImage
      coverImage
      bio
      location
      country
      subscriptionPrice
      subscriptionPlans
      isMonetizationComplete
      createdAt
      updatedAt
    `)
    .lean();

  if (!artist) {
    throw new NotFoundError("Artist not found");
  }

  res.status(200).json({
    success: true,
    data: {
      id: artist._id,
      name: artist.name,
      slug: artist.slug,

      // images
      profileImage: artist.profileImage || null,
      coverImage: artist.coverImage || null,

      // profile info
      bio: artist.bio || "",
      location: artist.location || "",
      country: artist.country || "",

      // monetization
      monetization: {
        isComplete: artist.isMonetizationComplete || false,
        subscriptionPrice: artist.subscriptionPrice || null,
        plans: artist.subscriptionPlans || [],
      },

      // metadata
      createdAt: artist.createdAt,
      updatedAt: artist.updatedAt,
    },
  });
};
