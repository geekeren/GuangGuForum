import { URLS } from '../urls'
import { request } from "../client"

interface CommentUpvotePayload {
    reply_id: string;
}


export async function commentUpvote(payload: CommentUpvotePayload) {
    return request(URLS.REPLY_VOTE, {
        method: 'GET',
        query: {
            ...payload,
        },
        header: {
            Accept: "application/json, text/javascript, */*; q=0.01",
        }
    });
}