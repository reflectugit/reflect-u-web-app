import { NextRequest, NextResponse } from "next/server";
import { RekognitionClient, IndexFacesCommand } from "@aws-sdk/client-rekognition";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const USERNAME_RE = /^[a-z0-9_]{2,32}$/;

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const image = formData.get("image") as File | null;
  const username = (formData.get("username") as string | null)?.trim();
  const uid = (formData.get("uid") as string | null)?.trim();

  if (!image || !username || !uid) {
    return NextResponse.json({ error: "Missing image, username, or uid." }, { status: 400 });
  }
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "Invalid username format." }, { status: 400 });
  }

  // Read into buffer — never written to disk, passed straight to Rekognition
  const imageBytes = Buffer.from(await image.arrayBuffer());

  try {
    const result = await rekognition.send(
      new IndexFacesCommand({
        CollectionId: process.env.REKOGNITION_COLLECTION_ID,
        Image: { Bytes: imageBytes },
        ExternalImageId: username,
        DetectionAttributes: ["DEFAULT"],
        QualityFilter: "AUTO",
        MaxFaces: 1,
      })
    );

    if (!result.FaceRecords?.length) {
      return NextResponse.json(
        { error: "No face detected. Make sure your face is well-lit and clearly visible." },
        { status: 422 }
      );
    }
  } catch (err: unknown) {
    const name = (err as { name?: string }).name ?? "";
    if (name === "InvalidParameterException") {
      return NextResponse.json(
        { error: "No face detected. Make sure your face is well-lit and clearly visible." },
        { status: 422 }
      );
    }
    if (name === "ImageTooLargeException") {
      return NextResponse.json({ error: "Image too large. Please retake." }, { status: 422 });
    }
    console.error("Rekognition error:", err);
    return NextResponse.json({ error: "Face indexing failed. Try again." }, { status: 500 });
  }

  // Reserve username + write user doc atomically
  try {
    await adminDb.runTransaction(async (t) => {
      const usernameRef = adminDb.collection("usernames").doc(username);
      const snap = await t.get(usernameRef);
      if (snap.exists) {
        throw Object.assign(new Error("USERNAME_TAKEN"), { code: "USERNAME_TAKEN" });
      }
      t.set(usernameRef, { userId: uid });
      t.set(
        adminDb.collection("users").doc(uid),
        { username, faceIndexed: true, googleConnected: false, createdAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "USERNAME_TAKEN") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    console.error("Firestore transaction error:", err);
    return NextResponse.json({ error: "Could not save your profile. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
