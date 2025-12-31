import { StatusCodes } from "http-status-codes";
import { UnauthorizedError, BadRequestError } from "../errors/index.js";
import { isAdmin } from "../utils/authHelper.js";
import {  createSongService } from "../services/songService.js";
import { uploadAudioFile, getCoverImage } from "../services/fileService.js";
import { shapeSongResponse } from "../dto/song.dto.js";
import { convertCurrencies } from "../utils/convertCurrencies.js";
import { Album } from "../models/Album.js";
import path from "path";



const ALLOWED_ACCESS_TYPES = ["free", "subscription", "purchase-only"];

const parseJSONSafe = (value, fieldName) => {
  if (!value) return null;

  if (typeof value === "object") return value;

  if (typeof value === "string") {
    try {
      // 🔥 IMPORTANT: trim + handle double-stringify
      let cleaned = value.trim();
      let parsed = JSON.parse(cleaned);

      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed.trim());
      }

      return parsed;
    } catch (err) {
      console.error(`Invalid ${fieldName}:`, JSON.stringify(value));
      throw new BadRequestError(`${fieldName} must be valid JSON`);
    }
  }

  throw new BadRequestError(`${fieldName} has invalid type`);
};

export const createSongController = async (req, res) => {
  /* -------------------- Auth / Artist check -------------------- */

  const artistId = req.user?.artistId;
  if (!artistId) {
    throw new UnauthorizedError("Artist profile not found");
  }

  /* -------------------- Input extraction -------------------- */

  let {
    title,
    genre,
    duration,
    basePrice,
    accessType = "subscription",
    releaseDate,
    albumOnly,
    album,
    isrc
  } = req.body;

  console.log(req.body.basePrice);
console.log(typeof req.body.basePrice);

  /* -------------------- Basic validation -------------------- */

  if (!title || !duration) {
    throw new BadRequestError("Title and duration are required");
  }

  if (!ALLOWED_ACCESS_TYPES.includes(accessType)) {
    throw new BadRequestError("Invalid access type");
  }

  const albumOnlyBool =
    albumOnly === undefined
      ? false
      : typeof albumOnly === "string"
      ? albumOnly === "true"
      : Boolean(albumOnly);

  if (albumOnlyBool && !album) {
    throw new BadRequestError("Album-only songs must belong to an album");
  }

  /* -------------------- Album validation -------------------- */

  const albumDoc = album
    ? await Album.findOne({ _id: album, artist: artistId })
        .select("coverImage genre accessType")
        .lean()
    : null;

  if (album && !albumDoc) {
    throw new UnauthorizedError(
      "Album not found or does not belong to you"
    );
  }

  if (albumOnlyBool && !albumDoc) {
    throw new UnauthorizedError(
      "Album-only songs must belong to a valid album"
    );
  }

  if (albumDoc && albumDoc.accessType !== accessType) {
    throw new BadRequestError(
      "Song access type must match album access type"
    );
  }

  /* -------------------- Genre resolution -------------------- */

  const genreArray = albumOnlyBool
    ? albumDoc?.genre || []
    : genre
    ? Array.isArray(genre)
      ? genre
      : genre.split(",").map((g) => g.trim())
    : [];

  /* -------------------- Pricing rules -------------------- */

  const isPurchaseOnly = accessType === "purchase-only";
  const isAlbumOnly = albumOnlyBool;
  const isSinglePurchaseSong = isPurchaseOnly && !isAlbumOnly;

  // Require price ONLY for purchase-only single songs
  if (isSinglePurchaseSong && !basePrice) {
    throw new BadRequestError(
      "Price is required for purchase-only single songs"
    );
  }

  // Disallow price everywhere else
  if (basePrice && (!isPurchaseOnly || isAlbumOnly)) {
    throw new BadRequestError(
      "Price can only be set for purchase-only single songs"
    );
  }

 basePrice = parseJSONSafe(req.body.basePrice, "basePrice");
  // Validate price structure
  if (basePrice) {
    if (
      typeof basePrice.amount !== "number" ||
      basePrice.amount <= 0 ||
      !basePrice.currency
    ) {
      throw new BadRequestError("Invalid price format");
    }
  }

  /* -------------------- File validation -------------------- */

  const audioFile = req.files?.audio?.[0];
  if (!audioFile) {
    throw new BadRequestError("Audio file is required");
  }

  if (!audioFile.mimetype.startsWith("audio/")) {
    throw new BadRequestError("Invalid audio file type");
  }

  const audioUrl = audioFile.location;
  let audioKey = audioFile.key;
  audioKey = path.basename(audioKey, path.extname(audioKey))
  console.log("Audio file uploaded:", audioUrl);
  console.log("Audio key:", audioKey);

  const coverImageUrl =
    !albumOnlyBool && req.files?.coverImage?.[0]?.location
      ? req.files.coverImage[0].location
      : albumDoc?.coverImage || "";

  /* -------------------- Currency conversion -------------------- */

  const convertedPrices =
    isSinglePurchaseSong
      ? await convertCurrencies(
          basePrice.currency,
          basePrice.amount
        )
      : [];

  /* -------------------- Persistence -------------------- */

  const song = await createSongService({
    data: {
      title,
      artist: artistId,
      genre: genreArray,
      duration,
      accessType,
      basePrice: basePrice
        ? {
            amount: Number(basePrice.amount),
            currency: basePrice.currency,
          }
        : null,
      releaseDate,
      albumOnly: albumOnlyBool,
      album,
      convertedPrices,
      isrc,
    },
    audioUrl,
    audioKey,
    coverImageUrl,
    
  });

  /* -------------------- Response -------------------- */

  res.status(StatusCodes.CREATED).json({
    success: true,
    song: shapeSongResponse(song, false),
  });
};

export const updateSong = async (req, res) => {
  /* -------------------- Auth / Artist check -------------------- */
  const artistId = req.user?.artistId;
  if (!artistId) {
    throw new UnauthorizedError("Artist profile not found");
  }

  /* -------------------- Fetch song with ownership -------------------- */
  const song = await Song.findOne({
    _id: req.params.id,
    artist: artistId,
  });

  if (!song) {
    throw new NotFoundError("Song not found or access denied");
  }

  let {
    title,
    genre,
    duration,
    basePrice,
    accessType,
    releaseDate,
    albumOnly,
    album,
    isrc,
  } = req.body;

  /* -------------------- Access type validation -------------------- */
  if (accessType && !ALLOWED_ACCESS_TYPES.includes(accessType)) {
    throw new BadRequestError("Invalid access type");
  }

  const finalAccessType = accessType || song.accessType;

  /* -------------------- Album-only handling -------------------- */
  const albumOnlyBool =
    albumOnly === undefined
      ? song.albumOnly
      : typeof albumOnly === "string"
      ? albumOnly === "true"
      : Boolean(albumOnly);

  if (albumOnlyBool && !album && !song.album) {
    throw new BadRequestError("Album-only songs must belong to an album");
  }

  /* -------------------- Album validation -------------------- */
  const albumDoc = album
    ? await Album.findOne({ _id: album, artist: artistId })
        .select("genre coverImage accessType")
        .lean()
    : null;

  if (album && !albumDoc) {
    throw new UnauthorizedError("Album not found or does not belong to you");
  }

  if (albumDoc && albumDoc.accessType !== finalAccessType) {
    throw new BadRequestError(
      "Song access type must match album access type"
    );
  }

  /* -------------------- Genre resolution -------------------- */
  const genreArray =
    albumOnlyBool
      ? albumDoc?.genre || song.genre
      : genre !== undefined
      ? Array.isArray(genre)
        ? genre
        : genre.split(",").map((g) => g.trim())
      : song.genre;

  /* -------------------- Pricing rules -------------------- */
  const isPurchaseOnly = finalAccessType === "purchase-only";
  const isSinglePurchaseSong = isPurchaseOnly && !albumOnlyBool;

  basePrice = parseJSONSafe(basePrice, "basePrice");

  if (isSinglePurchaseSong && !basePrice && !song.basePrice) {
    throw new BadRequestError(
      "Price is required for purchase-only single songs"
    );
  }

  if (basePrice && (!isPurchaseOnly || albumOnlyBool)) {
    throw new BadRequestError(
      "Price can only be set for purchase-only single songs"
    );
  }

  if (basePrice) {
    if (
      typeof basePrice.amount !== "number" ||
      basePrice.amount <= 0 ||
      !basePrice.currency
    ) {
      throw new BadRequestError("Invalid price format");
    }
  }

  /* -------------------- File uploads -------------------- */
  let audioUrl = song.audioUrl;
  let audioKey = song.audioKey;

  const audioFile = req.files?.audio?.[0];
  if (audioFile) {
    if (!audioFile.mimetype.startsWith("audio/")) {
      throw new BadRequestError("Invalid audio file type");
    }
    audioUrl = audioFile.location;
    audioKey = path.basename(
      audioFile.key,
      path.extname(audioFile.key)
    );
  }

  const coverImageUrl =
    req.files?.coverImage?.[0]?.location ||
    (albumOnlyBool ? albumDoc?.coverImage : song.coverImage);

  /* -------------------- Currency conversion -------------------- */
  let convertedPrices = song.convertedPrices;
  if (isSinglePurchaseSong && basePrice) {
    convertedPrices = await convertCurrencies(
      basePrice.currency,
      basePrice.amount
    );
  }

  /* -------------------- Apply updates -------------------- */
  if (title !== undefined) song.title = title;
  if (duration !== undefined) song.duration = duration;
  if (releaseDate !== undefined) song.releaseDate = releaseDate;
  if (accessType !== undefined) song.accessType = accessType;
  if (albumOnly !== undefined) song.albumOnly = albumOnlyBool;
  if (album !== undefined) song.album = album;
  if (isrc !== undefined) song.isrc = isrc;

  song.genre = genreArray;
  song.audioUrl = audioUrl;
  song.audioKey = audioKey;
  song.coverImage = coverImageUrl;

  song.basePrice = basePrice
    ? {
        amount: Number(basePrice.amount),
        currency: basePrice.currency,
      }
    : isSinglePurchaseSong
    ? song.basePrice
    : null;

  song.convertedPrices = convertedPrices;

  await song.save();

  res.status(StatusCodes.OK).json({
    success: true,
    song: shapeSongResponse(song, false),
  });
};