import { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import Logging from '../library/Logging';
import { config } from '../config/config';
import { statusCodes, statusMessages } from '../library/statusCodes';

import { userGetOne, userGetById, userGetAll, userCreate, userDelete, userUpdate } from '../models/User.model';
import { RequestWithInterfaces, User } from '../library/Interfaces.lib';
import { UserProps } from '../library/types.lib';

export const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password, name, phone, shopName } = req.body;
        //check if the request body contains the variables
        if (!email || !password || !name || !phone || !shopName) {
            Logging.error(statusMessages.InputsNotFilled, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.InputsNotFilled });
        }
        //check variables types
        if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || typeof phone !== 'string' || typeof shopName !== 'string') {
            Logging.error(statusMessages.InputsNotFilledOrTypesWrong, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.InputsNotFilledOrTypesWrong });
        }

        //check existing user
        const existingEmail = await userGetOne({ email: email });
        if (existingEmail) {
            Logging.error(statusMessages.EmailFailed, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.EmailFailed });
        }

        const existingShopName = await userGetOne({ shopName: shopName });
        if (existingShopName) {
            Logging.error(statusMessages.ShopNameFailed, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.ShopNameFailed });
        }

        const existingPhone = await userGetOne({ phone: phone });
        if (existingPhone) {
            Logging.error(statusMessages.PhoneFailed, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.PhoneFailed });
        }

        const user = await userCreate({
            name,
            email,
            password: await bcrypt.hash(password, 10),
            phone,
            shopName
        });

        Logging.info(statusMessages.RegisterSuccess + ' for email:' + email + ' for shopName:' + shopName, true);
        return res.status(statusCodes.Ok).json({ Message: statusMessages.RegisterSuccess }).end();
    } catch (error) {
        Logging.error(error, true);
        return res.status(statusCodes.BadRequest).json({ message: error });
    }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            Logging.error(statusMessages.InputsNotFilled, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.InputsNotFilled });
        }

        if (typeof email != 'string' || typeof password != 'string') {
            Logging.error(statusMessages.InputsNotFilledOrTypesWrong, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.InputsNotFilledOrTypesWrong });
        }

        const user = await userGetOne({ email: email });
        if (!user) {
            Logging.error(statusMessages.UserNotFound, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.UserNotFound });
        } else if (!user.password) {
            Logging.error(statusMessages.UserNotFound, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.UserNotFound });
        }

        const canLogin = await bcrypt.compare(password, user.password);

        if (!canLogin) {
            Logging.error(statusMessages.LoginFailed, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.LoginFailed });
        }

        const ipCheck = <string>req.headers['x-forwarded-for'] || <string>req.socket.remoteAddress || '';
        const userIp = ipCheck.split(',')[0];

        let data = {
            Id: user._id,
            shopName: user.shopName,
            role: user.role
        };

        const accessToken = jwt.sign(data, config.secret.jwtSecret, {
            expiresIn: '7d'
        });

        const refreshToken = jwt.sign(data, config.secret.jwtSecret, {
            expiresIn: '7d'
        });

        user.refreshToken = refreshToken;
        user.ip = userIp;

        user.save()
            .then()
            .catch((err) => {
                Logging.warn('Failed to save user ip or refreshToken', false);
            });

        res.cookie('client_session', accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            domain: '.efes.tech',
            maxAge: 3600000 //1 hour
        });

        res.header('Authorization', `Bearer ${accessToken}`);

        Logging.info(user.email + ' is logged in.', false);
        return res.status(statusCodes.Ok).json({ message: statusMessages.LoginSuccess, User: data }).end();
    } catch (error) {
        Logging.error(error, true);
        return res.status(statusCodes.BadRequest).json({ message: error });
    }
};

export const updateUser = async (req: RequestWithInterfaces, res: Response, next: NextFunction) => {
    try {
        if (!req.params.userId || req.user === null || typeof req.user === 'undefined') {
            Logging.error(statusMessages.InputsNotFilled, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.InputsNotFilled });
        }

        const userIdFromParams = req.params.userId;
        const userIdFromToken = req.user.Id;

        if (userIdFromParams !== userIdFromToken) {
            Logging.error(statusMessages.UserIdFailed, false);
            return res.status(statusCodes.NotFound).json({ message: statusMessages.UserIdFailed });
        }

        const props = req.body;

        const updateOpts: { [id: string]: string } = {};

        for (const key in props) {
            const newData: UserProps = props[key];
            updateOpts[newData.propName] = newData.value;

            if (newData.propName === 'email') {
                const existingEmail = await userGetOne({ email: newData.value });
                if (existingEmail) {
                    Logging.error(statusMessages.EmailFailed, false);
                    return res.status(statusCodes.BadRequest).json({ message: statusMessages.EmailFailed });
                }
            } else if (newData.propName === 'phone') {
                if (typeof newData.value === 'number') {
                    const existingPhone = await userGetOne({ phone: newData.value });
                    if (existingPhone) {
                        Logging.error(statusMessages.PhoneFailed, false);
                        return res.status(statusCodes.BadRequest).json({ message: statusMessages.PhoneFailed });
                    }
                }
            } else if (newData.propName === 'shopName') {
                const existingShopName = await userGetOne({ shopName: newData.value });
                if (existingShopName) {
                    Logging.error(statusMessages.ShopNameFailed, false);
                    return res.status(statusCodes.BadRequest).json({ message: statusMessages.ShopNameFailed });
                }
            }

            if (newData.propName === 'password') {
                updateOpts[newData.propName] = await bcrypt.hash(newData.value, 10);
            }
        }

        const updatedUser = await userUpdate(userIdFromToken, updateOpts);

        if (!updatedUser) {
            Logging.info(statusMessages.UpdateFailed, false);
            return res.status(statusCodes.Ok).json({ message: statusMessages.UpdateFailed }).end();
        }
        Logging.info(statusMessages.UpdateSuccess, false);
        return res.status(statusCodes.Ok).json({ message: statusMessages.UpdateSuccess }).end();
    } catch (error) {
        Logging.error(error, true);
        return res.status(statusCodes.BadRequest).json({ message: error });
    }
};

export const deleteUser = async (req: RequestWithInterfaces, res: Response, next: NextFunction) => {
    try {
        if (!req.params.userId || req.user === null || typeof req.user === 'undefined') {
            Logging.error(statusMessages.InputsNotFilled, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.InputsNotFilled });
        }

        const userIdFromParams = req.params.userId;
        const userIdFromToken = req.user.Id;

        if (userIdFromParams !== userIdFromToken) {
            Logging.error(statusMessages.UserIdFailed, false);
            return res.status(statusCodes.NotFound).json({ message: statusMessages.UserIdFailed });
        }

        const deletedUser = await userDelete(userIdFromToken);
        if (!deletedUser) {
            Logging.info(statusMessages.DeleteFailed, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.DeleteFailed });
        }
        Logging.info(statusMessages.DeleteSuccess, false);
        return res.status(statusCodes.Ok).json({ Message: statusMessages.DeleteSuccess }).end();
    } catch (error) {
        Logging.error(error, true);
        return res.status(statusCodes.BadRequest).json({ message: error });
    }
};

export const getUserDetail = async (req: RequestWithInterfaces, res: Response, next: NextFunction) => {
    try {
        const userIdFromParams = req.params.userId;
        const userIdFromToken = req.user?.Id;

        if (!userIdFromParams || !userIdFromToken) {
            Logging.error(statusMessages.InputsNotFilled, false);
            return res.status(statusCodes.BadRequest).json({ message: statusMessages.InputsNotFilled });
        }

        if (userIdFromParams !== userIdFromToken) {
            Logging.error(statusMessages.UserIdFailed, false);
            return res.status(statusCodes.NotFound).json({ message: statusMessages.UserIdFailed });
        }

        const user = await userGetById(userIdFromParams);

        if (!user) {
            Logging.info(statusMessages.UserNotFound, false);
            return res.status(statusCodes.NotFound).json({ message: statusMessages.UserNotFound }).end();
        }

        Logging.info(statusMessages.DetailsSuccess, false);
        return res.status(statusCodes.Ok).json({ message: statusMessages.DetailsSuccess, user: user }).end();
    } catch (error) {
        Logging.error(error, true);
        return res.status(statusCodes.BadRequest).json({ message: error });
    }
};
