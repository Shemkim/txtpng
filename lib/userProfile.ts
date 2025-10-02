import { FirebaseError } from 'firebase/app';
import { User } from 'firebase/auth';
import { doc, getDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from './firebase';

/**
 * Ensure the authenticated user has a Firestore profile document and update login metadata.
 */
export const syncUserProfile = async (user: User): Promise<void> => {
  try {
    const userRef = doc(db, 'users', user.uid);

    const baseData = {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
    };

    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      await setDoc(userRef, {
        ...baseData,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        loginCount: 1,
      });
      return;
    }

    await setDoc(
      userRef,
      {
        ...baseData,
        lastLogin: serverTimestamp(),
        loginCount: increment(1),
      },
      { merge: true }
    );
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      console.warn('Skipping user profile sync due to insufficient permissions.');
      return;
    }

    throw error;
  }
};
