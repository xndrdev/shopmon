import { getConnection, getKv } from "../../db";
import Users from "../../repository/users";
import bcryptjs from "bcryptjs";
import { ErrorResponse, NoContentResponse } from "../common/response";
import { validateEmail } from "../auth/register";

const revokeTokens = async (userId: string) => {
    const result = await getKv().list({prefix: `u-${userId}-`});
    
    for (const key of result.keys) {
        await getKv().delete(key.name);
    }
}

export async function accountMe(req: Request): Promise<Response> {
    const result = await getConnection().execute('SELECT id, email, created_at FROM user WHERE id = ?', [req.userId]);

    const json = result.rows[0];

    const teamResult = await getConnection().execute('SELECT team.id, team.name, team.created_at, (team.owner_id = user_to_team.user_id) as is_owner  FROM team INNER JOIN user_to_team ON user_to_team.team_id = team.id WHERE user_to_team.user_id = ?', [req.userId]);

    json.teams = teamResult.rows;
    
    return new Response(JSON.stringify(json), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

export async function accountDelete(req: Request): Promise<Response> {
    await Users.delete(req.userId);

    await getKv().delete(req.headers.get('token') as string)

    return new NoContentResponse();
}

export async function accountUpdate(req: Request): Promise<Response> {
    const {currentPassword, email, newPassword } = await req.json();

    const result = await getConnection().execute('SELECT id, password FROM user WHERE id = ?', [req.userId]);

    if (!result.rows.length) {
        return new ErrorResponse('User not found', 404);
    }

    const user = result.rows[0];

    if (!bcryptjs.compareSync(currentPassword, user.password)) {
        return new ErrorResponse('Invalid password', 400);
    }

    if (email !== undefined && !validateEmail(email)) {
        return new ErrorResponse('Invalid email', 400);
    }

    if (newPassword !== undefined && newPassword.length < 8) {
        return new ErrorResponse('Password must be at least 8 characters', 400);
    }

    if (newPassword !== undefined) {
        const hash = bcryptjs.hashSync(newPassword, 10);

        await revokeTokens(req.userId);

        await getConnection().execute('UPDATE user SET password = ? WHERE id = ?', [hash, req.userId]);
    }

    if (email !== undefined) {
        await getConnection().execute('UPDATE user SET email = ? WHERE id = ?', [email, req.userId]);
    }

    return new NoContentResponse();
}