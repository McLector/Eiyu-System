import {supabase} from './client';
import {ADULT_AI_MESSAGE} from '../data/account-age';

/** Pin this request's identity; never let SDK token lookup switch its owner. */
export async function authorizationForOwner(userId: string, message: string = ADULT_AI_MESSAGE): Promise<string> {
 const {data, error} = await supabase.auth.getSession();
 if (error || data.session?.user.id !== userId || !data.session.access_token) throw new Error(message);
 return `Bearer ${data.session.access_token}`;
}
